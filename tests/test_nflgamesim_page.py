"""Spec for the multi-week mygamesim page paste (current grammar). No DB."""
from __future__ import annotations

from pathlib import Path

import polars as pl
import pytest

from nfl_edge.benchmark import nflgamesim as G

FIXTURE = Path(__file__).parent / "fixtures" / "nflgamesim_page.txt"


def _by_week():
    return G.parse_page(FIXTURE.read_text())


def test_page_splits_into_weeks_with_their_games():
    weeks = _by_week()
    assert sorted(weeks) == [3, 4]
    assert [(c["away_raw"], c["home_raw"]) for c in weeks[4]["cards"]] == [
        ("Indianapolis Colts", "Washington Commanders"),
        ("New England Patriots", "Buffalo Bills"),
    ]
    assert len(weeks[3]["cards"]) == 2


def test_card_fields_follow_the_current_grammar():
    ind = _by_week()[4]["cards"][0]
    assert (ind["ml_home"], ind["ml_away"]) == (154, -185)  # ML: first is home
    assert (ind["spread"], ind["total"]) == (3.5, 47.5)
    assert ind["winner_raw"] == "Washington Commanders"
    assert (ind["win_pts"], ind["lose_pts"], ind["margin"], ind["pct"]) == (25.3, 22.0, 3.3, 57.45)


def test_site_flags_final_only_when_a_pick_line_exists():
    w3, w4 = _by_week()[3]["cards"], _by_week()[4]["cards"]
    assert [c["site_final"] for c in w4] == [False, False]
    atl, lac = w3
    assert (atl["site_final"], atl["site_pick"], atl["site_margin_hit"], atl["site_ats_hit"]) == (
        True, "incorrect", False, True)
    assert (lac["site_final"], lac["site_pick"], lac["site_margin_hit"], lac["site_ats_hit"]) == (
        True, "correct", True, True)


def test_summary_lines_are_read_per_week():
    weeks = _by_week()
    assert weeks[3]["summary"] == {"pick": 9, "margin": 10, "ats": 9}
    assert weeks[4]["summary"] == {"pick": 0, "margin": 0, "ats": 0}


def test_cards_feed_build_rows_with_home_first_ml():
    sched = pl.DataFrame([{
        "game_id": "2026_04_IND_WAS", "season": 2026, "week": 4,
        "gameday": "2026-10-04", "gametime": "09:30",
        "home_team": "WAS", "away_team": "IND",
        "home_score": None, "away_score": None, "result": None, "total": None,
    }, {
        "game_id": "2026_04_NE_BUF", "season": 2026, "week": 4,
        "gameday": "2026-10-04", "gametime": "13:00",
        "home_team": "BUF", "away_team": "NE",
        "home_score": None, "away_score": None, "result": None, "total": None,
    }])
    rows = G.build_rows(_by_week()[4]["cards"], sched, 2026, 4)
    was = rows[0]
    assert (was["sim_pick_winner"], was["sim_margin_home"], was["sim_p_home_win"]) == (
        "WAS", "3.3", "0.5745")
    assert was["market_spread_home"] == "3.5" and was["market_ml_home"] == "154"
    assert was["ats_result"] == "" and was["status"] == "pending"


def test_flag_mismatches_name_the_game_and_the_flag():
    cards = _by_week()[3]["cards"]
    rows = [
        {"game_id": "a", "away_team": "ATL", "home_team": "GB", "status": "final",
         "pick_winner_result": "incorrect", "margin_within_7": "no", "ats_result": "correct"},
        # site says Pick: Correct, Margin Hit, Vs Spread Hit; we say all three missed
        {"game_id": "b", "away_team": "LAC", "home_team": "BUF", "status": "final",
         "pick_winner_result": "incorrect", "margin_within_7": "no", "ats_result": "incorrect"},
    ]
    got = G.flag_mismatches(cards, rows)
    assert got == [
        "b LAC@BUF pick: site correct, ours incorrect",
        "b LAC@BUF margin within 7: site hit, ours no",
        "b LAC@BUF vs spread: site hit, ours incorrect",
    ]


def test_flag_mismatches_skip_games_not_final_on_our_side():
    cards = _by_week()[3]["cards"]
    rows = [{"game_id": "a", "away_team": "ATL", "home_team": "GB", "status": "pending",
             "pick_winner_result": "", "margin_within_7": "", "ats_result": ""}]
    assert G.flag_mismatches(cards[:1], rows) == []


def test_page_without_week_headers_fails_closed():
    with pytest.raises(ValueError, match="Week"):
        G.parse_page("just some text\n")


def test_incomplete_game_block_fails_closed():
    broken = FIXTURE.read_text().replace("ML: -290 / +235\n", "")
    with pytest.raises(ValueError, match="Atlanta Falcons"):
        G.parse_page(broken)


def _tie_card(ats_hit: bool) -> dict:
    # GB @ MIN, MIN -1.5, site margin shows 1.5: rounded edge is exactly 0
    return {
        "away_raw": "Green Bay Packers", "home_raw": "Minnesota Vikings",
        "ml_home": -120, "ml_away": 100, "spread": -1.5, "total": 45.5,
        "winner_raw": "Minnesota Vikings", "win_pts": 26.9, "lose_pts": 25.4,
        "margin": 1.5, "pct": 54.36,
        "site_final": True, "site_pick": "correct", "site_margin_hit": True,
        "site_ats_hit": ats_hit,
    }


def _tie_sched() -> pl.DataFrame:
    return pl.DataFrame([{
        "game_id": "2026_01_GB_MIN", "season": 2026, "week": 1,
        "gameday": "2026-09-13", "gametime": "13:00",
        "home_team": "MIN", "away_team": "GB",
        "home_score": 24, "away_score": 21, "result": 3, "total": 45,
    }])


def test_rounded_zero_edge_takes_the_side_the_site_says_covered():
    (row,) = G.build_page_week([_tie_card(True)], _tie_sched(), 2026, 1)
    assert row["sim_ats_lean"] == "MIN"  # cover_at = 3 - 1.5 > 0, site called it a hit
    assert row["ats_result"] == "correct"
    assert G.flag_mismatches([_tie_card(True)], [row]) == []


def test_rounded_zero_edge_stays_a_miss_when_the_site_missed():
    (row,) = G.build_page_week([_tie_card(False)], _tie_sched(), 2026, 1)
    assert row["sim_ats_lean"] == "push"
    assert row["ats_result"] == "incorrect"
