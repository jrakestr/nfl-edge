"""Spec for defender event shares (priors/defense.py)."""
from __future__ import annotations

import polars as pl
import pytest

from nfl_edge.priors import defense as D

C = {"recency_half_life_weeks": 8, "shrink_k_usage": 1,
     "cold_start_frac": 0.6, "cold_start_rank_factor": {1: 1.0, 2: 0.6}}


def _weeks(rows: list[tuple]) -> pl.DataFrame:
    """rows: (week, player_id, team, group, sacks, ints, fum_rec, defense_pct)."""
    df = pl.DataFrame(rows, schema=["week", "player_id", "team", "def_group", "sacks", "ints",
                                    "fum_rec", "defense_pct"], orient="row")
    df = df.with_columns(pl.lit(2026).alias("season"),
                         *[pl.col(c).cast(pl.Float64) for c in ("sacks", "ints", "fum_rec", "defense_pct")])
    tt = df.group_by(["week", "team"]).agg(
        pl.col("sacks").sum().alias("team_sacks"), pl.col("ints").sum().alias("team_ints"),
        pl.col("fum_rec").sum().alias("team_fum_rec"))
    return df.join(tt, on=["week", "team"])


def _roster(rows: list[tuple]) -> pl.DataFrame:
    return pl.DataFrame(rows, schema=["team", "player_id", "full_name", "position"], orient="row")


HIST = _weeks([
    (w, pid, "AAA", grp, s, i, f, snap)
    for w in (1, 2, 3, 4)
    for pid, grp, s, i, f, snap in (("edge", "DL", 1.0, 0, 0, 0.9), ("dt", "DL", 0.0, 0, 1, 0.8),
                                    ("cb", "DB", 0.0, 1, 0, 1.0), ("backup", "DL", 0.0, 0, 0, 0.1))
] + [
    (w, pid, "BBB", grp, s, i, f, snap)
    for w in (1, 2, 3, 4)
    for pid, grp, s, i, f, snap in (("rush", "DL", 2.0, 0, 0, 0.9), ("lb", "LB", 0.5, 1, 1, 1.0))
])


def test_shares_sum_to_one_per_team_and_event():
    ros = _roster([("AAA", "edge", "E", "DL"), ("AAA", "dt", "T", "DL"), ("AAA", "cb", "C", "DB"),
                   ("AAA", "backup", "B", "DL"), ("BBB", "rush", "R", "DL"), ("BBB", "lb", "L", "LB")])
    out = D.build(HIST, ros, 2026, 5, C)
    sums = out.group_by("team").agg([pl.col(s).sum() for s in D.SHARE_COLS])
    for row in sums.iter_rows(named=True):
        for s in D.SHARE_COLS:
            assert row[s] == pytest.approx(1.0)
    aaa = {r["player_id"]: r for r in out.filter(pl.col("team") == "AAA").iter_rows(named=True)}
    assert aaa["edge"]["sack_share"] > aaa["backup"]["sack_share"] > 0
    assert aaa["cb"]["int_share"] > aaa["edge"]["int_share"]


def test_traded_defender_takes_history_to_roster_team():
    ros = _roster([("AAA", "edge", "E", "DL"), ("AAA", "rush", "R", "DL"),
                   ("BBB", "lb", "L", "LB")])
    out = D.build(HIST, ros, 2026, 5, C)
    rush = out.filter(pl.col("player_id") == "rush").row(0, named=True)
    assert rush["team"] == "AAA"
    edge = out.filter(pl.col("player_id") == "edge").row(0, named=True)
    assert 0.3 < rush["sack_share"] < edge["sack_share"]
    assert out.filter(pl.col("team") == "AAA")["sack_share"].sum() == pytest.approx(1.0)
    assert out.filter(pl.col("team") == "BBB")["player_id"].to_list() == ["lb"]


def test_no_history_enters_only_through_depth_chart():
    ros = _roster([("AAA", "edge", "E", "DL"), ("AAA", "rookie", "Rk", "DL"),
                   ("AAA", "ghost", "G", "LB")])
    dc = pl.DataFrame({"team": ["AAA"], "player_id": ["rookie"], "position": ["DL"], "depth_rank": [1]})
    out = D.build(HIST, ros, 2026, 5, C, depth_df=dc)
    ids = set(out["player_id"])
    assert "rookie" in ids and "ghost" not in ids
    assert out.filter(pl.col("player_id") == "rookie")["sack_share"].item() > 0


def test_ruled_out_defender_is_dropped_and_team_renormalizes():
    ros = _roster([("AAA", "edge", "E", "DL"), ("AAA", "dt", "T", "DL"), ("AAA", "cb", "C", "DB")])
    ov = pl.DataFrame({"player_id": ["edge"], "status": ["out"], "usage_multiplier": [None]})
    out = D.build(HIST, ros, 2026, 5, C, overrides=ov)
    assert "edge" not in out["player_id"].to_list()
    assert out["sack_share"].sum() == pytest.approx(1.0)


def test_empty_inputs_give_empty_frame():
    out = D.build(HIST.head(0), _roster([("AAA", "edge", "E", "DL")]), 2026, 5, C)
    assert out.is_empty() and set(D.SHARE_COLS) <= set(out.columns)


def test_history_sql_applies_as_of_filter(monkeypatch):
    seen = []
    monkeypatch.setattr(D, "read_sql", lambda sql, *a, **k: seen.append(sql) or pl.DataFrame())
    D.load_def_weeks(2026, 8)
    assert "(d.season = 2026 and d.week < 8)" in seen[0]
    assert "(s.season = 2026 and s.week < 8)" in seen[0]
