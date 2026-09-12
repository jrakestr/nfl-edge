"""Spec for results/grade.py: outcome, PnL, CLV, pick_close, and one-snapshot grading.

Pure functions against the stub; the I/O `run` is covered by tests/test_grade_e2e.py.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from nfl_edge.market.edge import decimal_odds, devig_two_way
from nfl_edge.results import grade as G

ET = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")


def _edges(p_home=0.58, p_over=0.56, p_ml=0.80, m_home=0.50, m_over=0.50, m_ml=0.76,
           price_home=-110, price_away=-110, kelly=0.02, snap_id=10) -> list[dict]:
    def row(mt, side, p, m, price, line):
        return {"market_type": mt, "side": side, "ref_id": "2025_10_NO_DET",
                "model_prob": p, "market_prob": m, "edge": p - m, "kelly_fraction": kelly,
                "market_line_id": snap_id, "price": price, "p_push": 0.0, "hold": 0.045,
                "line": line}
    return [
        row("spread", "home", p_home, m_home, price_home, 3.5),
        row("spread", "away", 1 - p_home, 1 - m_home, price_away, 3.5),
        row("total", "over", p_over, m_over, -110, 44.5),
        row("total", "under", 1 - p_over, 1 - m_over, -110, 44.5),
        row("moneyline", "home", p_ml, m_ml, -400, 0.0),
        row("moneyline", "away", 1 - p_ml, 1 - m_ml, 310, 0.0),
    ]


def _bet(snap_id=10, spread=3.5, total=44.5, **kw) -> dict:
    d = {"id": snap_id, "game_id": "2025_10_NO_DET", "spread_line": spread, "total_line": total,
         "home_spread_odds": -110, "away_spread_odds": -110, "over_odds": -110, "under_odds": -110,
         "home_moneyline": -400, "away_moneyline": 310}
    d.update(kw)
    return d


def _close(source="snapshot", snap_id=10, spread=3.5, total=44.5, **kw) -> dict:
    d = {"source": source, "market_line_id": snap_id, "spread_line": spread, "total_line": total,
         "home_spread_odds": -110, "away_spread_odds": -110, "over_odds": -110, "under_odds": -110,
         "home_moneyline": -400, "away_moneyline": 310}
    d.update(kw)
    return d


def _game(result=7.0, total=51.0, n_snapshots=1) -> dict:
    return {"game_id": "2025_10_NO_DET", "home_team": "DET", "away_team": "NO",
            "result": result, "total": total, "n_snapshots": n_snapshots}


def _verdict(snap_id=10, side="home", total_side="over", call="pays") -> dict:
    return {
        "run_id": "abc", "game_id": "2025_10_NO_DET", "market_line_id": snap_id,
        "payload": {
            "chips": {
                "side": {"market_type": "spread", "side": side, "label": "DET -3.5"},
                "total": {"market_type": "total", "side": total_side, "label": "Over 44.5"},
            },
            "calls": {"cover": {"market_type": "spread", "side": "home", "call": call,
                                "price": -110, "needs": 0.524}},
        },
    }


# ----------------------------------------------------------------------------- outcome
@pytest.mark.parametrize(
    "side,line,result,want",
    [
        ("home", 3.5, 7.0, 1), ("away", 3.5, 7.0, 0),
        ("home", 3.5, 0.0, 0), ("away", 3.5, 0.0, 1),
        ("home", -3.5, -7.0, 0), ("away", -3.5, -7.0, 1),
        ("home", -3.5, 0.0, 1), ("away", -3.5, 0.0, 0),
        ("home", 3.0, 3.0, None), ("away", 3.0, 3.0, None),
        ("home", 3.0, 7.0, 1), ("away", 3.0, 0.0, 1),
    ],
)
def test_outcome_spread(side, line, result, want):
    assert G.outcome("spread", side, line, result, 45.0) == want


@pytest.mark.parametrize(
    "side,line,total,want",
    [
        ("over", 44.5, 50.0, 1), ("under", 44.5, 50.0, 0),
        ("over", 44.5, 40.0, 0), ("under", 44.5, 40.0, 1),
        ("over", 44.5, 44.5, None), ("under", 44.5, 44.5, None),
    ],
)
def test_outcome_total(side, line, total, want):
    assert G.outcome("total", side, line, 7.0, total) == want


@pytest.mark.parametrize(
    "side,result,want",
    [("home", 3.0, 1), ("away", 3.0, 0), ("home", -3.0, 0), ("away", -3.0, 1),
     ("home", 0.0, None), ("away", 0.0, None)],
)
def test_outcome_moneyline(side, result, want):
    assert G.outcome("moneyline", side, 0.0, result, 41.0) == want


def test_both_sides_never_both_win_and_push_is_both_none():
    cases = [
        ("spread", "home", "away", 3.5, 7.0, 45.0),
        ("spread", "home", "away", 3.5, 0.0, 45.0),
        ("spread", "home", "away", 3.0, 3.0, 45.0),
        ("total", "over", "under", 44.5, 7.0, 50.0),
        ("total", "over", "under", 44.5, 7.0, 44.5),
        ("moneyline", "home", "away", 0.0, 3.0, 41.0),
        ("moneyline", "home", "away", 0.0, 0.0, 41.0),
    ]
    for mt, a, b, line, result, total in cases:
        oa, ob = G.outcome(mt, a, line, result, total), G.outcome(mt, b, line, result, total)
        assert not (oa == 1 and ob == 1)
        if oa is None:
            assert ob is None


# ----------------------------------------------------------------------------- pnl
def test_pnl_plus_100_win_is_one():
    assert G.pnl(1, 100) == pytest.approx(1.0)


def test_pnl_minus_110_win():
    assert G.pnl(1, -110) == pytest.approx(decimal_odds(-110) - 1)


def test_pnl_loss_and_push():
    assert G.pnl(0, -110) == pytest.approx(-1.0)
    assert G.pnl(None, -110) == pytest.approx(0.0)
    assert G.pnl(0, 150) == pytest.approx(-1.0)


# ----------------------------------------------------------------------------- clv_points
def test_clv_points_sign_conventions():
    assert G.clv_points("spread", "home", 3.0, 3.5) == pytest.approx(0.5)
    assert G.clv_points("spread", "away", 3.0, 3.5) == pytest.approx(-0.5)
    assert G.clv_points("total", "over", 44.5, 45.5) == pytest.approx(1.0)
    assert G.clv_points("total", "under", 44.5, 45.5) == pytest.approx(-1.0)
    assert G.clv_points("moneyline", "home", 0.0, 0.0) is None
    assert G.clv_points("spread", "home", 3.5, 3.5) == pytest.approx(0.0)


# ----------------------------------------------------------------------------- closing_prob / clv
def test_closing_prob_is_devig_of_our_side():
    p, _ = devig_two_way(-120, 100)
    assert G.closing_prob(-120, 100) == pytest.approx(p)


def test_clv_positive_when_close_steeper_toward_us_zero_when_unchanged():
    bet = _bet()
    close_steep = _close(home_spread_odds=-150, away_spread_odds=130)
    rows = G.grade_snapshot(_edges(), bet, close_steep, _game(), _verdict())
    home = next(r for r in rows if r["market_type"] == "spread" and r["side"] == "home")
    assert home["clv"] == pytest.approx(home["closing_prob"] - home["market_prob"])
    assert home["clv"] > 0
    close_same = _close()
    same = next(r for r in G.grade_snapshot(_edges(), bet, close_same, _game(), _verdict())
                if r["market_type"] == "spread" and r["side"] == "home")
    assert same["clv"] == pytest.approx(0.0)


# ----------------------------------------------------------------------------- pick_close / kickoff
def test_kickoff_null_gametime_is_end_of_day_et():
    k = G.kickoff_at(date(2025, 11, 9), None)
    assert k == datetime(2025, 11, 9, 23, 59, tzinfo=ET)


def test_kickoff_uses_gametime_et():
    k = G.kickoff_at(date(2025, 11, 9), "13:00")
    assert k == datetime(2025, 11, 9, 13, 0, tzinfo=ET)


def test_kickoff_home_location_still_uses_gametime():
    k = G.kickoff_at(date(2026, 9, 13), "13:00", "Home")
    assert k == datetime(2026, 9, 13, 13, 0, tzinfo=ET)


def test_kickoff_neutral_is_midnight_et():
    k = G.kickoff_at(date(2026, 9, 10), "20:35", "Neutral")
    assert k == datetime(2026, 9, 10, 0, 0, tzinfo=ET)


def test_run_for_kickoff_newest_before():
    kick = datetime(2026, 9, 9, 20, 20, tzinfo=ET)
    runs = [
        {"run_id": "old", "created_at": datetime(2026, 9, 5, 6, 30, tzinfo=UTC)},
        {"run_id": "live", "created_at": datetime(2026, 9, 8, 0, 35, tzinfo=UTC)},
        {"run_id": "after", "created_at": datetime(2026, 9, 12, 19, 24, tzinfo=UTC)},
    ]
    assert G.run_for_kickoff(runs, kick) == "live"


def test_run_for_kickoff_none_when_all_after():
    kick = datetime(2025, 11, 9, 13, 0, tzinfo=ET)
    runs = [{"run_id": "backtest", "created_at": datetime(2026, 9, 4, 12, 0, tzinfo=UTC)}]
    assert G.run_for_kickoff(runs, kick) is None


def test_predated_kickoff_true_only_when_run_is_before():
    kick = datetime(2026, 9, 9, 20, 20, tzinfo=ET)
    assert G.predated_kickoff(datetime(2026, 9, 8, 0, 35, tzinfo=UTC), kick) is True
    assert G.predated_kickoff(datetime(2026, 9, 12, 19, 24, tzinfo=UTC), kick) is False


def test_run_for_kickoff_neutral_rejects_afternoon_resim():
    """London stored as 20:35 ET; a 13:00 ET Sunday re-sim must not predate midnight."""
    kick = G.kickoff_at(date(2026, 10, 4), "20:35", "Neutral")
    runs = [
        {"run_id": "sat", "created_at": datetime(2026, 10, 3, 18, 0, tzinfo=UTC)},
        {"run_id": "sun_1pm", "created_at": datetime(2026, 10, 4, 17, 0, tzinfo=UTC)},  # 13:00 ET
    ]
    assert G.run_for_kickoff(runs, kick) == "sat"


def test_pick_close_last_pre_kickoff_among_three():
    kickoff = datetime(2025, 11, 9, 13, 0, tzinfo=ET)
    snaps = [
        {"id": 1, "captured_at": kickoff - timedelta(days=2), "spread_line": 3.0, "total_line": 44.5},
        {"id": 2, "captured_at": kickoff - timedelta(hours=1), "spread_line": 3.5, "total_line": 45.0},
        {"id": 3, "captured_at": kickoff + timedelta(hours=1), "spread_line": 4.0, "total_line": 45.5},
    ]
    close = G.pick_close(snaps, kickoff, {"spread_line": 7.0, "total_line": 40.0})
    assert close["source"] == "snapshot" and close["market_line_id"] == 2
    assert close["spread_line"] == pytest.approx(3.5)


def test_pick_close_schedules_fallback_when_none_pre_kickoff():
    kickoff = datetime(2025, 11, 9, 13, 0, tzinfo=ET)
    snaps = [{"id": 9, "captured_at": kickoff + timedelta(days=1), "spread_line": 3.5, "total_line": 44.5}]
    sched = {"spread_line": 3.5, "total_line": 44.5, "home_spread_odds": -108, "away_spread_odds": -112,
             "over_odds": -110, "under_odds": -110, "home_moneyline": -180, "away_moneyline": 160}
    close = G.pick_close(snaps, kickoff, sched)
    assert close["source"] == "schedules" and close["market_line_id"] is None
    assert close["spread_line"] == pytest.approx(3.5)
    assert close["home_spread_odds"] == -108


def test_pick_close_none_when_schedules_line_null():
    kickoff = datetime(2025, 11, 9, 13, 0, tzinfo=ET)
    close = G.pick_close([], kickoff, {"spread_line": None, "total_line": None})
    assert close is None


def test_grade_snapshot_still_grades_when_close_is_none():
    rows = G.grade_snapshot(_edges(), _bet(), None, _game(), _verdict())
    assert len(rows) == 6
    assert all(r["close_source"] is None and r["clv"] is None and r["close_line"] is None for r in rows)
    assert all(r["outcome"] in (0, 1, None) for r in rows)
    home = next(r for r in rows if r["market_type"] == "spread" and r["side"] == "home")
    assert home["outcome"] == 1 and home["clv_points"] is None


# ----------------------------------------------------------------------------- grade_snapshot
def test_grade_snapshot_six_rows_last_snapshot_picks_and_call():
    rows = G.grade_snapshot(_edges(), _bet(), _close(), _game(n_snapshots=1), _verdict())
    assert len(rows) == 6
    assert all(r["is_last_snapshot"] for r in rows)
    picks = [(r["market_type"], r["side"]) for r in rows if r["verdict_pick"]]
    assert sorted(picks) == [("spread", "home"), ("total", "over")]
    calls = [r for r in rows if r["verdict_call"] is not None]
    assert len(calls) == 1
    assert calls[0]["market_type"] == "spread" and calls[0]["side"] == "home"
    assert calls[0]["verdict_call"] == "pays"
    home = next(r for r in rows if r["market_type"] == "spread" and r["side"] == "home")
    assert home["pnl"] == pytest.approx(decimal_odds(-110) - 1)
    assert home["pnl_kelly"] == pytest.approx(home["kelly_fraction"] * home["pnl"])
    assert home["actual"] == pytest.approx(7.0)
    tot = next(r for r in rows if r["market_type"] == "total" and r["side"] == "over")
    assert tot["actual"] == pytest.approx(51.0) and tot["outcome"] == 1


def test_grade_snapshot_is_last_only_for_matching_close_id_when_several():
    rows = G.grade_snapshot(_edges(snap_id=10), _bet(snap_id=10), _close(snap_id=11),
                            _game(n_snapshots=3), _verdict(snap_id=10))
    assert all(r["is_last_snapshot"] is False for r in rows)
    last = G.grade_snapshot(_edges(snap_id=11), _bet(snap_id=11), _close(snap_id=11),
                            _game(n_snapshots=3), _verdict(snap_id=11))
    assert all(r["is_last_snapshot"] for r in last)


def test_payload_without_structured_fields_raises():
    old = {"run_id": "abc", "game_id": "2025_10_NO_DET", "market_line_id": 10,
           "payload": {"chips": {"side": {"label": "DET -3.5"}, "total": {"label": "Over 44.5"}}}}
    with pytest.raises(ValueError, match="lines --recompute --run"):
        G.grade_snapshot(_edges(), _bet(), _close(), _game(), old)
