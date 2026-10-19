"""Slate actuals: source precedence, DNP, DST, and the nflverse handoff."""
from __future__ import annotations

import pytest

from nfl_edge.config import load_yaml
from nfl_edge.results import slate_actuals as S
from nfl_edge.results.actuals import score_weekly
from nfl_edge.results.dfs_grade import dst_line, dst_points

RULES = load_yaml("scoring.yaml")


def _dst_stats(**over) -> dict:
    base = {
        "def_sacks": 0, "def_interceptions": 0, "fumble_recovery_opp": 0, "def_tds": 0,
        "special_teams_tds": 0, "def_safeties": 0, "def_fg_blocks": 0,
        "def_pat_blocks": 0, "def_punt_blocks": 0,
    }
    base.update(over)
    return base


def test_game_status_needs_player_rows_not_just_team_rows():
    assert S.game_status(None, 0, 2) == "pending"
    assert S.game_status("live", 0, 2) == "live"
    assert S.game_status("final", 0, 0) == "final"
    assert S.game_status(None, 4, 2) == "final"


def test_dnp_is_zero_and_live_with_no_row_is_zero_so_far():
    assert S.skill_actual("final", None, None, RULES) == (0.0, "dnp")
    pts, state = S.skill_actual("live", None, None, RULES)
    assert pts == 0.0 and state == "live"
    assert S.skill_actual("pending", None, None, RULES) == (None, "pending")


def test_nflverse_replaces_espn():
    nfl = {"rushing_yards": 100, "rushing_tds": 1}
    espn = {"rushing_yards": 10, "rushing_tds": 0}
    pts, state = S.skill_actual("live", nfl, espn, RULES)
    assert state == "final"
    assert pts == pytest.approx(score_weekly(nfl, RULES)["dk"])
    assert pts != pytest.approx(score_weekly(espn, RULES)["dk"])


def test_dst_points_allowed_drop_opponent_defensive_td():
    own = _dst_stats(def_sacks=1)
    opp = _dst_stats(def_tds=1)
    salaries = [{"player_id": "KC_DST", "team": "KC"}]
    schedules = [{
        "game_id": "g", "home_team": "KC", "away_team": "LV",
        "home_score": 24, "away_score": 7,
    }]
    live = [{
        "home": "KC", "away": "LV", "state": "final", "secs_remaining": 0,
        "home_score": 24, "away_score": 7,
    }]
    teams = [{"team": "KC", "stats": own}, {"team": "LV", "stats": opp}]
    rows, _ = S.resolve(2026, 6, salaries, schedules, [], [], live, [], teams, RULES)
    charged = dst_points(dst_line(own, opp, 7), RULES)
    full = dst_points(dst_line(own, _dst_stats(), 7), RULES)
    assert rows[0]["dk_pts"] == pytest.approx(charged)
    assert rows[0]["dk_pts"] > full
    assert rows[0]["state"] == "final"


def test_washington_salary_code_joins_the_schedule():
    salaries = [{"player_id": "p1", "team": "WSH"}]
    schedules = [{
        "game_id": "sf", "home_team": "SF", "away_team": "WAS",
        "home_score": None, "away_score": None,
    }]
    live = [{
        "home": "SF", "away": "WAS", "state": "live", "secs_remaining": 1200,
        "home_score": 7, "away_score": 3,
    }]
    rows, _ = S.resolve(2026, 6, salaries, schedules, [], [], live, [], [], RULES)
    assert rows[0]["game_id"] == "sf"
    assert rows[0]["state"] == "live"
    assert rows[0]["dk_pts"] == 0.0
    assert rows[0]["secs_remaining"] == 1200


def test_final_without_player_rows_does_not_write_dnp():
    salaries = [{"player_id": "p1", "team": "KC"}]
    schedules = [{
        "game_id": "g", "home_team": "KC", "away_team": "LV",
        "home_score": None, "away_score": None,
    }]
    teams = [
        {"team": "KC", "opponent_team": "LV", "stats": {}},
        {"team": "LV", "opponent_team": "KC", "stats": {}},
    ]
    rows, _ = S.resolve(2026, 6, salaries, schedules, [], teams, [], [], [], RULES)
    assert rows[0]["state"] == "pending"
    assert rows[0]["dk_pts"] is None


def test_recon_flags_a_gap_above_a_tenth():
    nfl = {"rushing_yards": 100}
    espn = {"rushing_yards": 50}
    salaries = [{"player_id": "p1", "team": "KC"}]
    schedules = [{
        "game_id": "g", "home_team": "KC", "away_team": "LV",
        "home_score": 20, "away_score": 10,
    }]
    weekly = [{"player_id": "p1", "team": "KC", "stats": nfl},
              {"player_id": "other", "team": "LV", "stats": {"rushing_yards": 1}}]
    teams = [
        {"team": "KC", "opponent_team": "LV", "stats": {}},
        {"team": "LV", "opponent_team": "KC", "stats": {}},
    ]
    live_players = [{"player_id": "p1", "stats": espn}]
    _, recon = S.resolve(2026, 6, salaries, schedules, weekly, teams, [], live_players, [], RULES)
    assert recon[0]["flagged"] is True
    assert recon[0]["diff"] == pytest.approx(
        score_weekly(espn, RULES)["dk"] - score_weekly(nfl, RULES)["dk"])
