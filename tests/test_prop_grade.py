"""Spec for grading prop_edges against player_stats_weekly. Skip when unpublished."""
from datetime import datetime
from zoneinfo import ZoneInfo

import polars as pl

from nfl_edge.market.edge import decimal_odds
from nfl_edge.results import prop_grade as P

ET = ZoneInfo("America/New_York")
NOW = datetime(2026, 9, 19, 12, 0, tzinfo=ET)


def test_actual_stat_maps_nflverse_keys():
    stats = {
        "rushing_yards": 91, "receiving_yards": 40, "receptions": 5,
        "rushing_tds": 1, "receiving_tds": 0, "passing_yards": 0, "passing_tds": 0,
    }
    assert P.actual_stat(stats, "rush_yds") == 91
    assert P.actual_stat(stats, "rec_yds") == 40
    assert P.actual_stat(stats, "rec") == 5
    assert P.actual_stat(stats, "anytime_td") == 1


def test_prop_outcome_over_under_push():
    assert P.prop_outcome("over", 83.5, 91) == 1
    assert P.prop_outcome("under", 83.5, 91) == 0
    assert P.prop_outcome("over", 83.5, 70) == 0
    assert P.prop_outcome("over", 83.0, 83.0) is None


def test_skip_unpublished():
    r = P.skip_unpublished(2026, 1)
    assert r["skipped"] is True
    assert r["reason"] == "scores unpublished"
    assert r["n_rows"] == 0


def test_actual_stat_maps_td_and_int_keys():
    stats = {"rushing_tds": 0, "receiving_tds": 2, "interceptions": 1}
    assert P.actual_stat(stats, "rush_td") == 0
    assert P.actual_stat(stats, "rec_td") == 2
    assert P.actual_stat(stats, "int") == 1
    assert P.actual_stat(stats, "anytime_td") == 2


def test_fair_over_hit_is_above_or_below_our_line():
    assert P.fair_over_hit(83.5, 91) == 1
    assert P.fair_over_hit(83.5, 70) == 0
    assert P.fair_over_hit(83.5, 83.5) is None
    assert P.fair_over_hit(0.5, 1) == 1
    assert P.fair_over_hit(0.5, 0) == 0


def _read_sql_for(fair_rows, edge_rows, weekly):
    def read_sql(sql, params=None):
        s = " ".join(sql.split()).lower()
        if "count(*)" in s and "player_stats_weekly" in s:
            return pl.DataFrame({"n": [5]})
        if "from model.fair_props" in s:
            return fair_rows
        if "from model.prop_edges" in s:
            return edge_rows
        if "from raw.player_stats_weekly" in s:
            return weekly
        return pl.DataFrame()

    return read_sql


def test_grade_fair_props_one_update_from_same_values(monkeypatch):
    """Per-row execute values, one UPDATE … FROM. Missing actuals are skipped."""
    fair_rows = pl.DataFrame([
        {"run_id": "r1", "player_id": "p1", "stat": "rush_yds", "fair_line": 83.5, "p_over": 0.6},
        {"run_id": "r1", "player_id": "p2", "stat": "rec_yds", "fair_line": 70.0, "p_over": 0.4},
        {"run_id": "r1", "player_id": "p3", "stat": "rec", "fair_line": 5.5, "p_over": 0.5},
    ])
    weekly = pl.DataFrame([
        {"player_id": "p1", "stats": {"rushing_yards": 91}},
        {"player_id": "p2", "stats": {"receiving_yards": 70}},
    ])
    calls = []

    def update_from(df, table, key_cols):
        calls.append((table, list(key_cols), df.to_dicts()))
        return len(df)

    monkeypatch.setattr(P, "read_sql", _read_sql_for(fair_rows, pl.DataFrame(), weekly))
    monkeypatch.setattr(P, "update_from", update_from)
    monkeypatch.setattr(P, "datetime", type("D", (), {"now": staticmethod(lambda tz=None: NOW)}))

    out = P.grade_fair_props(2026, 1)
    assert out["n_rows"] == 2
    assert len(calls) == 1
    table, keys, rows = calls[0]
    assert table == "model.fair_props"
    assert keys == ["run_id", "player_id", "stat"]
    by = {(r["run_id"], r["player_id"], r["stat"]): r for r in rows}
    assert by[("r1", "p1", "rush_yds")]["actual"] == 91
    assert by[("r1", "p1", "rush_yds")]["over_hit"] == 1
    assert by[("r1", "p2", "rec_yds")]["actual"] == 70
    assert by[("r1", "p2", "rec_yds")]["over_hit"] is None
    assert ("r1", "p3", "rec") not in by
    assert all(r["graded_at"] == NOW for r in rows)


def test_prop_edges_one_update_from_same_values(monkeypatch):
    edge_rows = pl.DataFrame([
        {"run_id": "r1", "market_prop_id": 10, "player_id": "p1", "stat": "rush_yds",
         "line": 83.5, "side": "over", "price": -110, "season": 2026, "week": 1},
        {"run_id": "r1", "market_prop_id": 10, "player_id": "p1", "stat": "rush_yds",
         "line": 83.5, "side": "under", "price": -110, "season": 2026, "week": 1},
    ])
    weekly = pl.DataFrame([{"player_id": "p1", "stats": {"rushing_yards": 91}}])
    calls = []

    def update_from(df, table, key_cols):
        calls.append((table, list(key_cols), df.to_dicts()))
        return len(df)

    monkeypatch.setattr(P, "read_sql", _read_sql_for(pl.DataFrame(), edge_rows, weekly))
    monkeypatch.setattr(P, "update_from", update_from)
    monkeypatch.setattr(P, "datetime", type("D", (), {"now": staticmethod(lambda tz=None: NOW)}))
    monkeypatch.setattr(P, "grade_fair_props", lambda *a, **k: {"n_rows": 0})

    out = P.run(2026, 1)
    assert out["n_rows"] == 2
    assert len(calls) == 1
    table, keys, rows = calls[0]
    assert table == "model.prop_edges"
    assert keys == ["run_id", "market_prop_id", "side"]
    by = {(r["side"]): r for r in rows}
    assert by["over"]["actual"] == 91
    assert by["over"]["outcome"] == 1
    assert by["over"]["pnl"] == float(decimal_odds(-110) - 1.0)
    assert by["under"]["outcome"] == 0
    assert by["under"]["pnl"] == -1.0
    assert all(r["graded_at"] == NOW for r in rows)
