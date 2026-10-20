"""Spec for nfl_edge.change_check: what moved since the newest complete sim. No database."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from nfl_edge import change_check as CC

T = datetime(2026, 10, 17, 3, 0, tzinfo=UTC)


def at(hours: float) -> datetime:
    return T + timedelta(hours=hours)


def test_override_changed_after_sim_suggests_resim():
    rows = [
        {"player": "A. Back", "team": "DET", "status": "out", "note": "dk main O", "updated_at": at(2)},
        {"player": "B. Wide", "team": "KC", "status": "out", "note": "manual", "updated_at": at(-5)},
    ]
    got = CC.override_reasons(rows, T)
    assert got == [{"player": "A. Back", "team": "DET", "source": "dk", "before": None,
                    "after": "out", "at": at(2).isoformat(), "affects_sim": True}]


def test_override_source_from_note_prefix():
    assert CC.source_of("fp Q injury") == "fantasypros"
    assert CC.source_of("dk full D") == "dk"
    assert CC.source_of("rts 0 proj") == "rts"
    assert CC.source_of("nfl.com wk4 inactives") == "manual"
    assert CC.source_of(None) == "manual"


def test_questionable_is_listed_but_does_not_suggest_resim():
    rows = [{"player": "C", "team": "SF", "status": "questionable", "note": "fp Q",
             "updated_at": at(1)}]
    got = CC.override_reasons(rows, T)
    assert got[0]["affects_sim"] is False


def test_espn_status_change_since_sim():
    snaps = [
        {"player": "A", "nfl_team": "DET", "status": "ACTIVE", "pulled_at": at(-3)},
        {"player": "A", "nfl_team": "DET", "status": "ACTIVE", "pulled_at": at(-1)},
        {"player": "A", "nfl_team": "DET", "status": "OUT", "pulled_at": at(4)},
        {"player": "B", "nfl_team": "KC", "status": "QUESTIONABLE", "pulled_at": at(-1)},
        {"player": "B", "nfl_team": "KC", "status": "QUESTIONABLE", "pulled_at": at(4)},
        {"player": "C", "nfl_team": "SF", "status": "OUT", "pulled_at": at(4)},  # no baseline
    ]
    got = CC.espn_reasons(snaps, T)
    assert got == [{"player": "A", "team": "DET", "source": "espn", "before": "ACTIVE",
                    "after": "OUT", "at": at(4).isoformat(), "affects_sim": True}]


def test_espn_back_from_out_affects_sim():
    snaps = [
        {"player": "A", "nfl_team": "DET", "status": "OUT", "pulled_at": at(-1)},
        {"player": "A", "nfl_team": "DET", "status": "ACTIVE", "pulled_at": at(2)},
    ]
    assert CC.espn_reasons(snaps, T)[0]["affects_sim"] is True


def test_line_moves_are_info_only():
    games = [
        {"game_id": "g1", "sim_spread": -3.0, "sim_total": 44.5, "spread_line": -4.0,
         "total_line": 44.5},
        {"game_id": "g2", "sim_spread": 2.5, "sim_total": 40.0, "spread_line": 2.5,
         "total_line": 40.0},
    ]
    assert CC.line_moves(games) == [{"game_id": "g1", "spread": [-3.0, -4.0]}]


def test_summarize_without_a_sim_suggests_one():
    out = CC.summarize(None, [], [], [])
    assert out["suggest_resim"] is True
    assert out["reasons"][0]["source"] == "no-sim"


def test_summarize_suggests_only_on_sim_relevant_changes():
    q = {"player": "C", "team": "SF", "source": "fantasypros", "before": None,
         "after": "questionable", "at": at(1).isoformat(), "affects_sim": False}
    out = CC.summarize({"run_id": "r", "created_at": T}, [q], [], [{"game_id": "g"}])
    assert out["suggest_resim"] is False and out["reasons"] == [q]
    assert out["info"] == [{"game_id": "g"}]
    out = CC.summarize({"run_id": "r", "created_at": T}, [q, {**q, "affects_sim": True}], [], [])
    assert out["suggest_resim"] is True


@pytest.mark.parametrize("status", ["out", "OUT", "doubtful", "DOUBTFUL", "ir", "INJURY_RESERVE",
                                    "SUSPENSION"])
def test_sim_relevant_statuses(status):
    assert CC.affects_sim(status)


# --- only games still to play ---------------------------------------------------------------

def _r(player, team, affects=True):
    return {"player": player, "team": team, "source": "espn", "before": "ACTIVE", "after": "OUT",
            "at": at(1).isoformat(), "affects_sim": affects}


def test_drop_started_keeps_only_teams_still_to_play():
    now = at(30)
    kickoffs = {"NE": at(10), "BUF": at(10), "SF": at(40), "WAS": at(40)}
    got = CC.drop_started([_r("A", "NE"), _r("B", "SF"), _r("C", "WSH"), _r("D", None)],
                          kickoffs, now)
    assert [x["player"] for x in got] == ["B", "C", "D"]
    assert got[1]["team"] == "WAS"


def test_unknown_kickoff_counts_as_still_to_play():
    assert [x["player"] for x in CC.drop_started([_r("A", "SF")], {"SF": None}, at(30))] == ["A"]


def test_drop_started_drops_teams_without_a_game_this_week():
    got = CC.drop_started([_r("A", "KC")], {"SF": at(40)}, at(30))
    assert got == []


def test_espn_codes_map_to_schedule_codes():
    assert CC.team_code("WSH") == "WAS"
    assert CC.team_code("LAR") == "LA"
    assert CC.team_code("JAC") == "JAX"
    assert CC.team_code("SF") == "SF"
    assert CC.team_code(None) is None


def test_line_moves_only_for_games_still_to_play():
    lines = [{"game_id": "g1", "spread": [1.0, 2.0]}, {"game_id": "g2", "total": [40.0, 42.0]}]
    assert CC.drop_started_lines(lines, {"g1"}) == [{"game_id": "g2", "total": [40.0, 42.0]}]


def test_no_game_left_means_no_resim():
    out = CC.summarize({"run_id": "r", "created_at": T}, [], [], [], games_left=0)
    assert out["suggest_resim"] is False
    out = CC.summarize(None, [], [], [], games_left=0)
    assert out["suggest_resim"] is False and out["reasons"] == []
