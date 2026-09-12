"""Spec for DFS lineup grading against player_stats_weekly. Pure functions; skip when unpublished."""
from __future__ import annotations

import numpy as np
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.results import dfs_grade as D
from nfl_edge.sim import scoring

RULES = load_yaml("scoring.yaml")


def test_scores_unpublished_when_no_weekly_rows():
    assert D.scores_published(0) is False
    assert D.scores_published(12) is True


def test_stats_json_maps_nflverse_keys_to_scoring_keys():
    raw = {
        "passing_yards": 250, "passing_tds": 2, "passing_interceptions": 1,
        "rushing_yards": 20, "rushing_tds": 0, "carries": 4,
        "receptions": 0, "receiving_yards": 0, "receiving_tds": 0,
        "rushing_fumbles_lost": 0, "receiving_fumbles_lost": 0, "sack_fumbles_lost": 0,
        "passing_2pt_conversions": 1,
    }
    s = D.offense_from_weekly(raw)
    pts = scoring.score_offense({k: np.array([v]) for k, v in s.items()}, RULES)
    assert s["int"] == 1
    assert s["two_pt"] == 1
    assert pts["dk"][0] == pytest.approx(250 * 0.04 + 2 * 4 - 1 + 20 * 0.1 + 2)


def test_lineup_dk_points_sums_skill_players():
    gibbs = D.offense_from_weekly({
        "rushing_yards": 105, "rushing_tds": 1, "receptions": 4, "receiving_yards": 30,
        "receiving_tds": 0, "rushing_fumbles_lost": 1,
    })
    total = D.lineup_dk_points([gibbs, gibbs], RULES)
    one = scoring.score_offense({k: np.array([v]) for k, v in gibbs.items()}, RULES)["dk"][0]
    assert total == pytest.approx(2 * one)


def test_lineup_dk_points_none_when_a_player_has_no_stats():
    gibbs = D.offense_from_weekly({"rushing_yards": 80})
    assert D.lineup_dk_points([gibbs, None], RULES) is None


def test_skip_report_when_unpublished():
    r = D.skip_unpublished(2026, 1)
    assert r["skipped"] is True
    assert r["reason"] == "scores unpublished"
    assert r["season"] == 2026
    assert r["week"] == 1
    assert r["n_lineups"] == 0
