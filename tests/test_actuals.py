"""Spec for results/actuals.py: nflverse weekly jsonb -> score_offense keys.

INT is passing_interceptions (the interceptions key is absent in stored jsonb).
fum_lost and two_pt are sums. GP opportunity is attempts + carries + targets >= 1.
"""
from __future__ import annotations

import numpy as np
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.results import actuals as A
from nfl_edge.sim import scoring

RULES = load_yaml("scoring.yaml")


def test_maps_passing_interceptions_not_interceptions():
    s = A.offense_from_weekly({
        "passing_yards": 250,
        "passing_tds": 2,
        "passing_interceptions": 1,
        "interceptions": 9,
    })
    assert s["pass_yds"] == 250
    assert s["pass_td"] == 2
    assert s["int"] == 1


def test_sums_fumbles_and_two_point_conversions():
    s = A.offense_from_weekly({
        "rushing_fumbles_lost": 1,
        "receiving_fumbles_lost": 1,
        "sack_fumbles_lost": 1,
        "fumbles_lost_total": 99,
        "passing_2pt_conversions": 1,
        "rushing_2pt_conversions": 1,
        "receiving_2pt_conversions": 1,
    })
    assert s["fum_lost"] == 3
    assert s["two_pt"] == 3


def test_score_weekly_calls_score_offense():
    raw = {
        "rushing_yards": 105,
        "rushing_tds": 1,
        "receptions": 4,
        "receiving_yards": 30,
        "rushing_fumbles_lost": 1,
    }
    mapped = A.offense_from_weekly(raw)
    direct = scoring.score_offense({k: np.array([v]) for k, v in mapped.items()}, RULES)
    scored = A.score_weekly(raw, RULES)
    assert scored["dk"] == pytest.approx(float(direct["dk"][0]))
    assert scored["ppr"] == pytest.approx(float(direct["ppr"][0]))


def test_regular_season_and_opportunity():
    assert A.is_regular({"season_type": "REG"}) is True
    assert A.is_regular({"season_type": "POST"}) is False
    assert A.had_opportunity({"attempts": 0, "carries": 0, "targets": 0}) is False
    assert A.had_opportunity({"attempts": 0, "carries": 0, "targets": 1}) is True
    assert A.had_opportunity({"attempts": 12, "carries": 0, "targets": 0}) is True


def test_reconcile_ppr_skips_postseason_and_nonskill():
    skill_reg = {
        "position": "RB",
        "stats": {
            "season_type": "REG",
            "rushing_yards": 100,
            "fantasy_points_ppr": 10.0,
        },
    }
    skill_post = {
        "position": "RB",
        "stats": {
            "season_type": "POST",
            "rushing_yards": 100,
            "fantasy_points_ppr": 10.0,
        },
    }
    dst = {
        "position": "DEF",
        "stats": {"season_type": "REG", "fantasy_points_ppr": 12.0},
    }
    report = A.reconcile_ppr([skill_reg, skill_post, dst], RULES)
    assert report["within"] + report["outside"] == 1
