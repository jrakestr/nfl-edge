"""Spec for defender event allocation (sim/players.allocate_defense) and score_defender.

Every defender quantity is a split of an event already on the opponent's draw:
  sacks   = multinomial(opp.sacks, Dirichlet(conc * sack_share))   sum == opp.sacks
  int     = multinomial(opp.int,   Dirichlet(conc * int_share))    sum == opp.int
  fum_rec = multinomial(sum opp fum_lost, Dirichlet(conc * fr_share))
Points use the DST event weights (sack 1, int 2, fumble recovery 2).
"""
from __future__ import annotations

import numpy as np
import polars as pl
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.sim import players as pp
from nfl_edge.sim import scoring

RULES = load_yaml("scoring.yaml")
CFG = {"players": {"usage_concentration": 40}}
N = 4000


class _Opp:
    def __init__(self, rng):
        self.sacks = rng.poisson(2.5, N)
        self.int = rng.poisson(0.8, N)


class _OppPlayers:
    def __init__(self, rng):
        self.fum_lost = rng.binomial(30, 0.01, size=(6, N))


SHARES = pl.DataFrame({
    "team": ["AAA"] * 4,
    "player_id": ["edge", "dt", "cb", "lb"],
    "position": ["DL", "DL", "DB", "LB"],
    "sack_share": [0.6, 0.3, 0.0, 0.1],
    "int_share": [0.0, 0.0, 0.7, 0.3],
    "fr_share": [0.25, 0.25, 0.25, 0.25],
})


def _alloc(seed=1, shares=SHARES):
    rng = np.random.default_rng(0)
    opp, opp_p = _Opp(rng), _OppPlayers(rng)
    d = pp.allocate_defense("AAA", opp, opp_p, shares, CFG, np.random.default_rng(seed))
    return opp, opp_p, d


def test_each_event_sums_to_the_team_draw():
    opp, opp_p, d = _alloc()
    np.testing.assert_array_equal(d.sacks.sum(axis=0), opp.sacks)
    np.testing.assert_array_equal(d.int.sum(axis=0), opp.int)
    np.testing.assert_array_equal(d.fum_rec.sum(axis=0), opp_p.fum_lost.sum(axis=0))


def test_zero_share_gets_zero_and_mean_tracks_share():
    opp, _, d = _alloc()
    i = d.player_ids.index("cb")
    assert d.sacks[i].sum() == 0
    edge = d.player_ids.index("edge")
    assert d.sacks[edge].mean() / opp.sacks.mean() == pytest.approx(0.6, abs=0.03)


def test_no_opponent_players_means_no_fumble_recoveries():
    rng = np.random.default_rng(0)
    d = pp.allocate_defense("AAA", _Opp(rng), None, SHARES, CFG, np.random.default_rng(1))
    assert d.fum_rec.sum() == 0


def test_no_shares_for_team_returns_none():
    _, _, d = _alloc(shares=SHARES.filter(pl.col("team") == "ZZZ"))
    assert d is None


def test_same_seed_same_draws():
    _, _, a = _alloc(seed=7)
    _, _, b = _alloc(seed=7)
    np.testing.assert_array_equal(a.sacks, b.sacks)
    np.testing.assert_array_equal(a.int, b.int)


def test_score_defender_uses_dst_event_weights():
    stats = {"sacks": np.array([2, 0]), "int": np.array([1, 0]), "fum_rec": np.array([1, 0])}
    pts = scoring.score_defender(stats, RULES)
    r = RULES["dst"]
    assert pts[0] == pytest.approx(2 * r["sack"] + r["int"] + r["fumble_rec"])
    assert pts[1] == 0.0
