"""Spec for market/edge.py: American odds, two-way de-vig, push-conditional model probabilities,
quarter Kelly at the actual price, and the six-row snapshot edge frame. Pure functions; no DB."""
from __future__ import annotations

from itertools import pairwise

import numpy as np
import polars as pl
import pytest

from nfl_edge.market import edge as E

CFG = {"kelly_multiplier": 0.25, "flat_edge": 0.01, "strong_edge": 0.03, "default_price": -110}


# ----------------------------------------------------------------------------- odds conversions
def test_american_to_prob_known_values():
    assert E.american_to_prob(-110) == pytest.approx(110 / 210)
    assert E.american_to_prob(150) == pytest.approx(0.4)
    assert E.american_to_prob(-100) == pytest.approx(0.5)
    assert E.american_to_prob(100) == pytest.approx(0.5)


def test_prob_to_american_round_trips():
    for a in (-110, -108, -112, -500, 124, 150, 320):
        assert E.prob_to_american(E.american_to_prob(a)) == pytest.approx(a, abs=1e-9)


def test_decimal_odds():
    assert E.decimal_odds(-110) == pytest.approx(210 / 110)
    assert E.decimal_odds(150) == pytest.approx(2.5)


# ----------------------------------------------------------------------------- de-vig
def test_devig_symmetric_prices_is_a_coin_flip_with_positive_hold():
    fair, hold = E.devig_two_way(-110, -110)
    assert fair == pytest.approx(0.5)
    assert hold == pytest.approx(2 * 110 / 210 - 1)  # ~4.76%


def test_devig_round_trip_at_zero_hold():
    for p in (0.3, 0.5, 0.65, 0.9):
        fair, hold = E.devig_two_way(E.prob_to_american(p), E.prob_to_american(1 - p))
        assert fair == pytest.approx(p)
        assert hold == pytest.approx(0.0, abs=1e-12)


def test_devig_both_sides_sum_to_one():
    h, hold_h = E.devig_two_way(-108, -112)
    a, hold_a = E.devig_two_way(-112, -108)
    assert h + a == pytest.approx(1.0)
    assert hold_h == pytest.approx(hold_a)
    assert h < 0.5 < a  # -112 is the shorter price, so away is the market favorite here


# ----------------------------------------------------------------------------- outcome probabilities
def test_outcome_probs_count_pushes_separately():
    vals = np.array([-3, 0, 3, 3, 7])
    win, push, lose = E.outcome_probs(vals, 3.0)
    assert (win, push, lose) == pytest.approx((0.2, 0.4, 0.4))
    assert E.conditional_prob(win, push) == pytest.approx(0.2 / 0.6)
    # the proj_games convention: push counts half
    assert E.half_push_prob(win, push) == pytest.approx(0.4)


def test_outcome_probs_half_point_line_has_no_push():
    vals = np.array([-3, 0, 3, 3, 7])
    win, push, lose = E.outcome_probs(vals, 2.5)
    assert push == 0.0
    assert win + lose == pytest.approx(1.0)


# ----------------------------------------------------------------------------- kelly
def test_kelly_is_zero_when_model_matches_the_price():
    for price in (-110, -108, -112, 150, -500):
        p = E.american_to_prob(price)  # the price's own break-even
        assert E.kelly(p, 0.0, price, 1.0) == pytest.approx(0.0, abs=1e-12)


def test_kelly_is_zero_at_fair_prob_when_the_book_holds():
    fair, _ = E.devig_two_way(-110, -110)  # 0.5: zero edge vs the de-vigged market
    assert E.kelly(fair, 0.0, -110, 0.25) == 0.0  # would be negative; clipped


def test_kelly_never_negative_and_monotone_in_model_prob():
    rng = np.random.default_rng(0)
    for _ in range(200):
        p = rng.uniform(0.01, 0.99)
        price = int(rng.choice([-300, -150, -110, -105, 100, 120, 200]))
        assert E.kelly(p, 0.0, price, 0.25) >= 0.0
    ks = [E.kelly(p, 0.0, -110, 1.0) for p in np.linspace(0.5, 0.9, 20)]
    assert all(b >= a for a, b in pairwise(ks))


def test_kelly_quarter_multiplier_and_push_scaling():
    full = E.kelly(0.6, 0.0, -110, 1.0)
    assert full > 0
    assert E.kelly(0.6, 0.0, -110, 0.25) == pytest.approx(full / 4)
    # a push returns the stake: win and lose mass both scale by (1 - push)
    assert E.kelly(0.6, 0.1, -110, 1.0) == pytest.approx(full * 0.9)


def test_kelly_known_value():
    # p = 0.6 at +100: f* = (0.6*1 - 0.4)/1 = 0.2
    assert E.kelly(0.6, 0.0, 100, 1.0) == pytest.approx(0.2)


# ----------------------------------------------------------------------------- snapshot edges
def _draws(n: int = 4000, seed: int = 1) -> pl.DataFrame:
    rng = np.random.default_rng(seed)
    home = rng.normal(27, 10, n).round().clip(0)
    away = rng.normal(21, 10, n).round().clip(0)
    return pl.DataFrame({"draw_no": np.arange(n), "home_pts": home, "away_pts": away})


SNAP = {
    "id": 42, "game_id": "2025_10_NO_DET", "spread_line": 7.0, "total_line": 44.5,
    "home_moneyline": -300, "away_moneyline": 250,
    "home_spread_odds": -108, "away_spread_odds": -112, "over_odds": -110, "under_odds": -110,
}


def test_snapshot_edges_shape_and_identities():
    rows = E.snapshot_edges(_draws(), SNAP, CFG)
    assert len(rows) == 6
    by = {(r["market_type"], r["side"]): r for r in rows}
    assert set(by) == {("spread", "home"), ("spread", "away"), ("total", "over"), ("total", "under"),
                       ("moneyline", "home"), ("moneyline", "away")}
    for a, b in (("home", "away"), ("over", "under")):
        mt = "spread" if a == "home" else "total"
        assert by[(mt, a)]["model_prob"] + by[(mt, b)]["model_prob"] == pytest.approx(1.0)
        assert by[(mt, a)]["market_prob"] + by[(mt, b)]["market_prob"] == pytest.approx(1.0)
        assert by[(mt, a)]["edge"] + by[(mt, b)]["edge"] == pytest.approx(0.0)
        assert by[(mt, a)]["p_push"] == pytest.approx(by[(mt, b)]["p_push"])
        assert by[(mt, a)]["hold"] == pytest.approx(by[(mt, b)]["hold"])
    for r in rows:
        assert r["market_line_id"] == 42 and r["ref_id"] == "2025_10_NO_DET"
        assert r["kelly_fraction"] >= 0.0
        assert r["edge"] == pytest.approx(r["model_prob"] - r["market_prob"])
    assert by[("spread", "home")]["price"] == -108
    assert by[("spread", "away")]["price"] == -112
    assert by[("moneyline", "away")]["price"] == 250
    assert by[("moneyline", "home")]["p_push"] > 0  # ties push; the draws contain some
    assert by[("spread", "home")]["p_push"] > 0  # integer line -> pushes exist


def test_snapshot_edges_model_prob_is_push_conditional():
    d = _draws()
    rows = {(r["market_type"], r["side"]): r for r in E.snapshot_edges(d, SNAP, CFG)}
    margin = (d["home_pts"] - d["away_pts"]).to_numpy()
    win, push, lose = E.outcome_probs(margin, 7.0)
    assert rows[("spread", "home")]["model_prob"] == pytest.approx(win / (win + lose))
    assert rows[("spread", "home")]["p_push"] == pytest.approx(push)


def test_snapshot_edges_missing_odds_fall_back_to_default_price():
    snap = {**SNAP, "home_spread_odds": None, "away_spread_odds": None}
    rows = {(r["market_type"], r["side"]): r for r in E.snapshot_edges(_draws(), snap, CFG)}
    assert rows[("spread", "home")]["price"] == -110
    assert rows[("spread", "home")]["market_prob"] == pytest.approx(0.5)


def test_snapshot_edges_skips_markets_without_a_line():
    snap = {**SNAP, "total_line": None}
    rows = E.snapshot_edges(_draws(), snap, CFG)
    assert len(rows) == 4
    assert not any(r["market_type"] == "total" for r in rows)


# ----------------------------------------------------------------------------- line grid
GRID_MARGIN = np.array([10, 7, 7, 3, 0, -3, -7], dtype=float)
GRID_TOTAL = np.array([38, 42, 44, 45, 48, 51, 55], dtype=float)


def test_line_grid_lookup_matches_outcome_probs_at_half_points():
    grid = E.build_line_grid(GRID_MARGIN, GRID_TOTAL)
    for line in np.arange(E.SPREAD_LO, E.SPREAD_HI + 0.5, 0.5):
        got = E.lookup_spread(grid, float(line))
        assert got is not None
        assert got == pytest.approx(E.outcome_probs(GRID_MARGIN, float(line)))
    for line in np.arange(E.TOTAL_LO, E.TOTAL_HI + 0.5, 0.5):
        got = E.lookup_total(grid, float(line))
        assert got is not None
        assert got == pytest.approx(E.outcome_probs(GRID_TOTAL, float(line)))


def test_line_grid_out_of_range_is_none():
    grid = E.build_line_grid(GRID_MARGIN, GRID_TOTAL)
    assert E.lookup_spread(grid, -30.5) is None
    assert E.lookup_spread(grid, 30.5) is None
    assert E.lookup_total(grid, 19.5) is None
    assert E.lookup_total(grid, 80.5) is None


def test_moneyline_is_the_grid_at_spread_zero():
    grid = E.build_line_grid(GRID_MARGIN, GRID_TOTAL)
    win, push, lose = E.lookup_spread(grid, 0.0)
    assert (win, push, lose) == pytest.approx(E.outcome_probs(GRID_MARGIN, 0.0))
    assert E.conditional_prob(win, push) == pytest.approx(win / (win + lose))
    # half-push home_win_prob would count the tie as 0.5; moneyline does not
    assert E.conditional_prob(win, push) != pytest.approx(E.half_push_prob(win, push))


def test_grid_snapshot_matches_draw_snapshot_edges():
    d = pl.DataFrame({"home_pts": GRID_MARGIN * 0 + 24 + GRID_MARGIN, "away_pts": np.full(7, 24.0)})
    # home - away == GRID_MARGIN; totals are not GRID_TOTAL, so only check spread + ML
    grid = E.build_line_grid(GRID_MARGIN, GRID_TOTAL)
    rows = {(r["market_type"], r["side"]): r for r in E.snapshot_edges(d, SNAP, CFG)}
    win, push, _ = E.lookup_spread(grid, 7.0)
    assert rows[("spread", "home")]["model_prob"] == pytest.approx(E.conditional_prob(win, push))
    win0, push0, _ = E.lookup_spread(grid, 0.0)
    assert rows[("moneyline", "home")]["model_prob"] == pytest.approx(E.conditional_prob(win0, push0))


def test_snapshot_edges_favors_the_stronger_home_team():
    rows = {(r["market_type"], r["side"]): r for r in E.snapshot_edges(_draws(), SNAP, CFG)}
    # home mean 27 vs away 21 -> fair margin ~6, book says 7: home cover prob just under a half
    assert 0.35 < rows[("spread", "home")]["model_prob"] < 0.55
    assert rows[("moneyline", "home")]["model_prob"] > 0.6
