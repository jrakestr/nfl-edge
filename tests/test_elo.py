"""Margin Elo: grading's point error moves a team rating the next sim reads."""
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.priors import elo
from nfl_edge.sim import game

CFG = load_yaml("sim.yaml")
LEAGUE = {"off_ppd": 2.13, "def_ppd_allowed": 2.13}


def _team(name):
    return game.TeamPrior(
        team=name, drives_mean=11.0, plays_per_drive=5.7, neutral_pass_rate=0.59,
        off_ppd=2.13, def_ppd_allowed=2.13, fg_per_drive=0.16, pass_td_share=0.62,
        int_rate=0.021, sack_rate=0.066,
    )


def _ctx():
    return game.GameContext(
        home_field_pts=1.5, rest_diff_days=0, wind_mph=0.0, roof="outdoors", neutral_site=False,
    )


def test_zero_rating_matches_points_per_drive():
    home, away = _team("NE"), _team("LV")
    bare = game.ppd_adjustments(home, away, _ctx(), CFG, LEAGUE, 11.0)
    rated = game.ppd_adjustments(home, away, _ctx(), CFG, LEAGUE, 11.0, elo_margin=0.0)
    assert rated == bare


def test_rating_gap_shifts_the_margin_by_the_full_gap():
    home, away = _team("NE"), _team("LV")
    drives = 11.0
    base = game.ppd_adjustments(home, away, _ctx(), CFG, LEAGUE, drives)
    shifted = game.ppd_adjustments(home, away, _ctx(), CFG, LEAGUE, drives, elo_margin=4.0)
    margin = (shifted["home"] - shifted["away"]) * drives - (base["home"] - base["away"]) * drives
    assert margin == pytest.approx(4.0)


def test_update_moves_both_ratings_and_keeps_the_sum():
    home, away = elo.apply_update(1.0, 2.0, actual_margin=-12.0, expected_margin=6.0, k=0.2)
    assert home == pytest.approx(-2.6)
    assert away == pytest.approx(5.6)
    assert home + away == pytest.approx(3.0)


def test_as_of_hides_the_target_week():
    rows = [
        {"team": "LV", "season": 2026, "week": 4, "rating": 1.5},
        {"team": "LV", "season": 2026, "week": 5, "rating": 9.0},
        {"team": "NE", "season": 2026, "week": 5, "rating": -9.0},
    ]
    got = elo.ratings_as_of(rows, 2026, 5)
    assert got == {"LV": 1.5}
    assert "NE" not in got


def test_null_score_and_missing_run_are_named_and_not_written():
    games = [
        {"game_id": "g-null", "season": 2026, "week": 4, "home_team": "LV", "away_team": "KC",
         "actual_margin": None, "run_id": "run-a", "mean_spread": 3.0},
        {"game_id": "g-norun", "season": 2026, "week": 4, "home_team": "NE", "away_team": "LV",
         "actual_margin": -3.0, "run_id": None, "mean_spread": None},
    ]
    updates, ratings, skipped = elo.plan_week(games, {}, k=0.2)
    assert updates == []
    assert ratings == []
    assert {s["game_id"]: s["reason"] for s in skipped} == {
        "g-null": "no_score",
        "g-norun": "no_predated_run",
    }


def test_week_uses_the_rating_from_before_the_games():
    games = [
        {"game_id": "g1", "season": 2026, "week": 2, "home_team": "LAC", "away_team": "LV",
         "actual_margin": -12.0, "run_id": "run-1", "mean_spread": 6.0},
    ]
    updates, ratings, skipped = elo.plan_week(games, {"LV": 1.0, "LAC": 0.0}, k=0.2)
    assert skipped == []
    assert updates[0]["expected_margin"] == 5.0
    assert updates[0]["rating_home_before"] == 0.0
    assert updates[0]["rating_away_before"] == 1.0
    by_team = {r["team"]: r["rating"] for r in ratings}
    error = -12.0 - 5.0
    assert by_team["LAC"] == 0.2 * error
    assert by_team["LV"] == 1.0 - 0.2 * error
