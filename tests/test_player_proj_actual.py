"""Spec for results/player_proj_actual.py: projected vs actual DK per player, bias cells, gate.

Residual = actual - projected (positive means we underproject). Diagnostic only: nothing here
touches priors, sim parameters, or config.
"""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from nfl_edge.results import player_proj_actual as P

ET = ZoneInfo("America/New_York")


def _proj(pid, pos, mean, run_id="r1", game_id="g1", **summary):
    return {
        "run_id": run_id, "player_id": pid, "game_id": game_id, "team": "AAA", "position": pos,
        "fpts_dk_mean": mean,
        "stat_summary": {
            "targets": {"mean": summary.get("targets", 0.0)},
            "carries": {"mean": summary.get("carries", 0.0)},
            "pass_yds": {"mean": summary.get("pass_yds", 0.0)},
            "rush_yds": {"mean": summary.get("rush_yds", 0.0)},
            "rec_yds": {"mean": summary.get("rec_yds", 0.0)},
        },
    }


# ----------------------------------------------------------------------------- residual
def test_residual_is_actual_minus_projected():
    assert P.residual(20.0, 15.0) == 5.0
    assert P.residual(3.0, 9.5) == -6.5


def test_build_rows_residual_and_p50():
    rows = P.build_rows(
        2026, 3,
        proj=[_proj("a", "WR", 12.0, targets=8.0, rec_yds=70.0)],
        actuals={"a": {"fpts_dk": 20.0, "had_opportunity": True}},
        weekly={"a": {"targets": 10, "carries": 0, "attempts": 0, "receiving_yards": 90}},
        drawstats={("r1", "a"): {"p50_dk": 11.4, "pass_att_mean": 0.0}},
    )
    r = rows[0]
    assert r["proj_dk_mean"] == 12.0 and r["proj_dk_p50"] == 11.4
    assert r["actual_dk"] == 20.0 and r["residual_dk"] == 8.0
    assert r["had_opportunity"] is True
    assert r["proj_targets"] == 8.0 and r["actual_targets"] == 10.0
    assert r["proj_rec_yds"] == 70.0 and r["actual_rec_yds"] == 90.0


def test_p50_and_attempts_null_when_parquet_pruned():
    rows = P.build_rows(
        2026, 3, proj=[_proj("a", "QB", 18.0)],
        actuals={"a": {"fpts_dk": 15.0, "had_opportunity": True}},
        weekly={"a": {"attempts": 30, "passing_yards": 250}},
        drawstats={},
    )
    assert rows[0]["proj_dk_p50"] is None and rows[0]["proj_pass_att"] is None
    assert rows[0]["actual_pass_att"] == 30.0


def test_player_without_actual_row_is_no_opportunity_and_null_actual():
    rows = P.build_rows(2026, 3, proj=[_proj("a", "RB", 9.0)], actuals={}, weekly={}, drawstats={})
    r = rows[0]
    assert r["had_opportunity"] is False
    assert r["actual_dk"] is None and r["residual_dk"] is None


def test_dst_and_non_skill_rows_are_not_written():
    rows = P.build_rows(
        2026, 3, proj=[_proj("AAA_DST", "DST", 8.0), _proj("a", "WR", 10.0)],
        actuals={}, weekly={}, drawstats={},
    )
    assert [r["player_id"] for r in rows] == ["a"]


# ----------------------------------------------------------------------------- run selection
def test_game_runs_picks_newest_run_before_kickoff_and_names_unrun_games():
    sched = [
        {"game_id": "g1", "gameday": "2026-09-27", "gametime": "13:00", "location": "Home", "result": 3},
        {"game_id": "tnf", "gameday": "2026-09-24", "gametime": "20:15", "location": "Home", "result": 7},
    ]
    runs = [
        {"run_id": "old", "created_at": datetime(2026, 9, 22, 9, tzinfo=ET)},
        {"run_id": "new", "created_at": datetime(2026, 9, 26, 20, tzinfo=ET)},
        {"run_id": "post", "created_at": datetime(2026, 9, 27, 14, tzinfo=ET)},
    ]
    chosen, skipped = P.game_runs(sched, runs)
    assert chosen == {"g1": "new", "tnf": "old"}
    assert skipped == []
    chosen, skipped = P.game_runs(sched, [runs[2]])
    assert chosen == {} and sorted(skipped) == ["g1", "tnf"]


# ----------------------------------------------------------------------------- fail closed
def test_missing_finals_writes_nothing_and_names_games(monkeypatch):
    monkeypatch.setattr(P, "games_missing_result", lambda s, w: ["2026_04_PIT_CLE", "2026_04_DAL_NYG"])
    monkeypatch.setattr(P, "upsert", lambda *a, **k: pytest.fail("must not write"))
    out = P.build_week(2026, 4)
    assert out["skipped"] is True and out["n_rows"] == 0
    assert "2026_04_PIT_CLE" in out["reason"] and "2026_04_DAL_NYG" in out["reason"]


# ----------------------------------------------------------------------------- tiers
def test_star_tier_is_top_n_by_projection_within_position():
    rows = [{"player_id": f"q{i}", "position": "QB", "proj_dk_mean": 30.0 - i} for i in range(14)]
    rows += [{"player_id": "t1", "position": "TE", "proj_dk_mean": 1.0}]
    out = {r["player_id"]: r["tier"] for r in P.assign_tiers(rows)}
    assert out["q0"] == "star" and out["q11"] == "star"
    assert out["q12"] == "rest" and out["q13"] == "rest"
    assert out["t1"] == "star"  # fewer than 12 TE in the pool: all are top 12


def test_tier_counts_are_fixed_constants():
    assert P.STAR_COUNTS == {"QB": 12, "RB": 24, "WR": 36, "TE": 12}
    assert P.MIN_N == 30


# ----------------------------------------------------------------------------- cells
def test_bias_cell_mean_pct_mae_se():
    cell = P.bias_cell("position", "WR", {1: [(12.0, 10.0), (8.0, 10.0), (15.0, 10.0), (13.0, 10.0)]})
    assert cell["n"] == 4
    assert cell["mean_resid"] == pytest.approx(2.0)
    assert cell["mean_pct"] == pytest.approx(100 * 8 / 40)
    assert cell["mae"] == pytest.approx((2 + 2 + 5 + 3) / 4)
    assert cell["se"] > 0


def test_ratio_cell_is_ratio_of_sums_not_mean_of_ratios():
    # (act_yds, act_touch, proj_yds, proj_touch): 100/10 and 5/1 -> ratio of sums 105/11
    cell = P.ratio_cell("channel", "rec yds per target", {1: [(100.0, 10.0, 80.0, 10.0), (5.0, 1.0, 4.0, 1.0)]})
    assert cell["actual"] == pytest.approx(105 / 11)
    assert cell["projected"] == pytest.approx(84 / 11)
    assert cell["mean_resid"] == pytest.approx(105 / 11 - 84 / 11)


# ----------------------------------------------------------------------------- gate
def test_gate_requires_n_two_weeks_same_sign_and_one_se():
    ok = P.gate({1: 2.0, 2: 1.5}, n=40, mean=1.8, se=0.5)
    assert ok[0] == "candidate"
    low_n = P.gate({1: 2.0, 2: 1.5}, n=29, mean=1.8, se=0.5)
    assert low_n[0] == "not enough evidence" and "29" in low_n[1]
    one_week = P.gate({1: 2.0}, n=40, mean=2.0, se=0.5)
    assert one_week[0] == "not enough evidence" and "week" in one_week[1]
    mixed = P.gate({1: 2.0, 2: -0.5}, n=40, mean=0.9, se=0.2)
    assert mixed[0] == "not enough evidence" and "sign" in mixed[1]
    noise = P.gate({1: 0.4, 2: 0.3}, n=40, mean=0.35, se=0.5)
    assert noise[0] == "not enough evidence" and "standard error" in noise[1]


# ----------------------------------------------------------------------------- report
def _row(week, pid, pos, proj, actual, opp=True, tier="rest", **kw):
    base = {
        "season": 2026, "week": week, "player_id": pid, "position": pos, "tier": tier,
        "proj_dk_mean": proj, "actual_dk": actual, "had_opportunity": opp,
        "residual_dk": None if actual is None else actual - proj,
        "proj_targets": 0.0, "actual_targets": 0.0, "proj_carries": 0.0, "actual_carries": 0.0,
        "proj_pass_att": None, "actual_pass_att": None,
        "proj_pass_yds": 0.0, "actual_pass_yds": 0.0, "proj_rush_yds": 0.0, "actual_rush_yds": 0.0,
        "proj_rec_yds": 0.0, "actual_rec_yds": 0.0,
    }
    base.update(kw)
    return base


def test_report_excludes_no_opportunity_and_counts_them():
    rows = [_row(1, "a", "WR", 10.0, 12.0), _row(1, "b", "WR", 10.0, 0.0, opp=False),
            _row(1, "c", "WR", 10.0, None, opp=False)]
    rep = P.report(rows)
    wr = next(c for c in rep["cells"] if c["dimension"] == "position" and c["label"] == "WR")
    assert wr["n"] == 1
    assert rep["did_not_play"] == 2


def test_report_has_every_dimension_and_never_lists_thin_cells_as_candidates():
    rows = [_row(1, "a", "WR", 10.0, 12.0, tier="star", proj_targets=8.0, actual_targets=9.0,
                 proj_rec_yds=70.0, actual_rec_yds=80.0)]
    rep = P.report(rows)
    dims = {c["dimension"] for c in rep["cells"]}
    assert {"position", "tier", "position and tier", "targets", "carries", "attempts",
            "yards per touch"} <= dims
    assert rep["candidates"] == []
    assert all(c["state"] == "not enough evidence" for c in rep["cells"])


def test_report_lists_candidate_with_owner_channel_and_changes_nothing():
    rows = []
    for w in (1, 2):
        for i in range(20):
            rows.append(_row(w, f"s{w}{i}", "WR", 15.0, 18.0 + (i % 3) * 0.1, tier="star"))
    rep = P.report(rows)
    cand = [c for c in rep["candidates"] if c["dimension"] == "tier" and c["label"] == "star"]
    assert len(cand) == 1 and cand[0]["owner"]
    assert "usage" in cand[0]["owner"] or "recency" in cand[0]["owner"] or "baseline" in cand[0]["owner"]
