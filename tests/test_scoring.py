"""Spec for sim/scoring.py: known stat lines -> exact DK/FD/PPR points, incl. bonuses and DST brackets.

Interface under test:
    scoring.score_offense(stats: dict[str, np.ndarray], rules: dict) -> dict[str, np.ndarray]
        stats keys: pass_yds, pass_td, int, rush_yds, rush_td, rec, rec_yds, rec_td, fum_lost, two_pt
        returns {"dk": ..., "fd": ..., "ppr": ...}
    scoring.score_dst(stats: dict[str, np.ndarray], rules: dict) -> np.ndarray
        stats keys: pts_allowed, sacks, int, fum_rec, td, safety, block_kick
"""
import numpy as np
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.sim import scoring

RULES = load_yaml("scoring.yaml")


def _line(**kw):
    keys = ["pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td",
            "fum_lost", "two_pt"]
    return {k: np.array([kw.get(k, 0)], dtype=float) for k in keys}


def test_qb_line_with_300_bonus():
    # 325 pass yds, 3 TD, 1 INT, 20 rush yds
    pts = scoring.score_offense(_line(pass_yds=325, pass_td=3, int=1, rush_yds=20), RULES)
    assert pts["dk"][0] == pytest.approx(325 * 0.04 + 3 * 4 - 1 + 20 * 0.1 + 3)   # 13+12-1+2+3 = 29
    assert pts["fd"][0] == pytest.approx(325 * 0.04 + 3 * 4 - 1 + 20 * 0.1)       # no 300 bonus on FD
    assert pts["ppr"][0] == pytest.approx(325 * 0.04 + 3 * 4 - 2 + 20 * 0.1)      # PPR: INT -2


def test_qb_exactly_300_gets_bonus_299_does_not():
    assert scoring.score_offense(_line(pass_yds=300), RULES)["dk"][0] == pytest.approx(12 + 3)
    assert scoring.score_offense(_line(pass_yds=299), RULES)["dk"][0] == pytest.approx(11.96)


def test_rb_line_with_100_rush_bonus_and_receptions():
    # 105 rush yds, 1 rush TD, 4 rec, 30 rec yds, 1 fumble lost
    pts = scoring.score_offense(_line(rush_yds=105, rush_td=1, rec=4, rec_yds=30, fum_lost=1), RULES)
    assert pts["dk"][0] == pytest.approx(10.5 + 6 + 4 + 3 - 1 + 3)    # 25.5
    assert pts["fd"][0] == pytest.approx(10.5 + 6 + 2 + 3 - 2)        # 19.5 (half PPR, -2 fumble)
    assert pts["ppr"][0] == pytest.approx(10.5 + 6 + 4 + 3 - 2)       # 21.5


def test_wr_double_bonus_not_possible_but_rec_bonus_is():
    pts = scoring.score_offense(_line(rec=8, rec_yds=120, rec_td=2), RULES)
    assert pts["dk"][0] == pytest.approx(8 + 12 + 12 + 3)
    assert pts["fd"][0] == pytest.approx(4 + 12 + 12)


def test_vectorized_over_draws():
    stats = {k: np.zeros(3) for k in _line()}
    stats["rush_yds"] = np.array([50.0, 100.0, 150.0])
    dk = scoring.score_offense(stats, RULES)["dk"]
    assert dk.tolist() == pytest.approx([5.0, 13.0, 18.0])


@pytest.mark.parametrize(
    "pts_allowed,expected",
    [(0, 10), (6, 7), (7, 4), (13, 4), (14, 1), (20, 1), (21, 0), (27, 0), (28, -1), (34, -1), (35, -4)],
)
def test_dst_points_allowed_brackets(pts_allowed, expected):
    stats = {"pts_allowed": np.array([pts_allowed]), "sacks": np.zeros(1), "int": np.zeros(1),
             "fum_rec": np.zeros(1), "td": np.zeros(1), "safety": np.zeros(1), "block_kick": np.zeros(1)}
    assert scoring.score_dst(stats, RULES)[0] == pytest.approx(expected)


def test_dst_full_line():
    stats = {"pts_allowed": np.array([17]), "sacks": np.array([3]), "int": np.array([2]),
             "fum_rec": np.array([1]), "td": np.array([1]), "safety": np.array([0]),
             "block_kick": np.array([0])}
    assert scoring.score_dst(stats, RULES)[0] == pytest.approx(1 + 3 + 4 + 2 + 6)
