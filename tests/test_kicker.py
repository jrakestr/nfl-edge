"""Spec for kicker projections: XP/FG come from the same game draws, split by distance, scored DK.

Interfaces under test:
    game._points(td, fg, rng) -> (pts, xp_made)
    TeamDraws.xp_made (from simulate_game)
    scoring.split_fg_by_distance(fg, mix, rng) -> (fg_0_39, fg_40_49, fg_50_plus)
    scoring.score_kicker(stats, rules) -> {"dk", "fd", "ppr"}
    priors.kicking.fg_distance_mix(made) -> [p_0_39, p_40_49, p_50_plus] | None
    priors.kicking.team_kickers(roster, overrides) -> {team: player_id}
    slate.kicker_projection(team_draws, kicker_id, game_id, mix, rules, rng) -> (row, frame, dk)
"""
import numpy as np
import polars as pl
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.priors import kicking
from nfl_edge.sim import game, scoring, slate

RULES = load_yaml("scoring.yaml")
CFG = load_yaml("sim.yaml")
MIX = [0.53, 0.27, 0.20]


def _team(name):
    return game.TeamPrior(team=name, drives_mean=10.8, plays_per_drive=5.7, neutral_pass_rate=0.59,
                          off_ppd=2.13, def_ppd_allowed=2.13, fg_per_drive=0.16,
                          pass_td_share=0.62, int_rate=0.021, sack_rate=0.066)


@pytest.fixture(scope="module")
def draws():
    ctx = game.GameContext(home_field_pts=0.0, rest_diff_days=0, wind_mph=0.0, roof="outdoors")
    league = {"drives_mean": 10.8, "off_ppd": 2.13, "def_ppd_allowed": 2.13}
    return game.simulate_game(_team("HOME"), _team("AWAY"), ctx, 4000, np.random.default_rng(3),
                              CFG, league)


def test_points_returns_xp_made_that_reconciles():
    rng = np.random.default_rng(1)
    td = rng.integers(0, 6, 5000)
    fg = rng.integers(0, 5, 5000)
    pts, xp = game._points(td, fg, rng)
    rest = pts - 6 * td - 3 * fg - xp            # 2 per made two-point try
    assert (xp >= 0).all() and (xp <= td).all()
    assert (rest % 2 == 0).all() and (rest >= 0).all()
    assert (rest // 2 <= td - xp).all()


def test_points_draws_unchanged_by_returning_xp():
    """Same rng calls in the same order: pts are identical to the 3-call formula."""
    td = np.array([0, 1, 2, 3, 4] * 200)
    fg = np.array([0, 1, 2, 1, 0] * 200)
    pts, _ = game._points(td, fg, np.random.default_rng(9))
    r = np.random.default_rng(9)
    two = r.binomial(td, game.TWO_PT_RATE)
    xp = r.binomial(td - two, game.XP_MAKE)
    two_made = r.binomial(two, game.TWO_PT_MAKE)
    assert (pts == 6 * td + 3 * fg + xp + 2 * two_made).all()


def test_game_draws_carry_xp(draws):
    for t in (draws.home, draws.away):
        assert t.xp_made is not None and t.xp_made.shape == t.pts.shape
        rest = t.pts - 6 * t.td - 3 * t.fg - t.xp_made
        assert (rest >= 0).all() and (rest % 2 == 0).all()


def test_split_fg_by_distance_sums_to_fg_and_follows_mix():
    rng = np.random.default_rng(4)
    fg = rng.integers(0, 5, 50000)
    a, b, c = scoring.split_fg_by_distance(fg, MIX, rng)
    assert (a + b + c == fg).all()
    made = fg.sum()
    assert abs(a.sum() / made - MIX[0]) < 0.01
    assert abs(c.sum() / made - MIX[2]) < 0.01


def test_score_kicker_dk_and_fd():
    stats = {"fg_0_39": np.array([1, 0]), "fg_40_49": np.array([1, 0]),
             "fg_50_plus": np.array([1, 0]), "xp": np.array([2, 0])}
    out = scoring.score_kicker(stats, RULES)
    assert out["dk"].tolist() == [3 + 4 + 5 + 2, 0]
    assert out["fd"].tolist() == [3 + 4 + 5 + 2, 0]


def test_fg_distance_mix_from_made_counts():
    made = {"fg_made_0_19": 2, "fg_made_20_29": 239, "fg_made_30_39": 300,
            "fg_made_40_49": 241, "fg_made_50_59": 196, "fg_made_60_": 4}
    mix = kicking.fg_distance_mix(made)
    assert mix == pytest.approx([541 / 982, 241 / 982, 200 / 982])
    assert kicking.fg_distance_mix({}) is None
    assert kicking.fg_distance_mix({"fg_made_40_49": 0}) is None


def test_team_kickers_one_active_not_ruled_out():
    roster = pl.DataFrame({
        "team": ["SF", "WAS", "KC", "KC", "BUF"],
        "player_id": ["k_sf", "k_was", "k_kc1", "k_kc2", "k_buf"],
    })
    overrides = pl.DataFrame({"player_id": ["k_buf"], "status": ["out"]})
    assert kicking.team_kickers(roster, overrides) == {"SF": "k_sf", "WAS": "k_was"}
    assert kicking.team_kickers(roster, None) == {"SF": "k_sf", "WAS": "k_was", "BUF": "k_buf"}


def test_kicker_projection_ties_to_team_draws(draws):
    t = draws.home
    row, frame, dk = slate.kicker_projection(t, "k_home", "G1", MIX, RULES, np.random.default_rng(5))
    assert row["position"] == "K" and row["player_id"] == "k_home" and row["team"] == "HOME"
    s = row["stat_summary"]
    assert s["xp"]["mean"] == pytest.approx(t.xp_made.mean(), abs=1e-3)
    assert s["fg"]["mean"] == pytest.approx(t.fg.mean(), abs=1e-3)
    # every FG and XP the team scored in the draw, and nothing else
    fgs = frame["fg_0_39"] + frame["fg_40_49"] + frame["fg_50_plus"]
    assert (fgs.to_numpy() == t.fg).all()
    assert (frame["xp"].to_numpy() == t.xp_made).all()
    assert row["fpts_dk_mean"] == pytest.approx(float(dk.mean()))
    expected = t.xp_made.mean() + t.fg.mean() * (3 * MIX[0] + 4 * MIX[1] + 5 * MIX[2])
    assert row["fpts_dk_mean"] == pytest.approx(expected, rel=0.03)


def test_kicker_points_never_exceed_team_kicking_points(draws):
    t = draws.away
    _, _frame, dk = slate.kicker_projection(t, "k", "G1", MIX, RULES, np.random.default_rng(6))
    assert (dk >= t.xp_made + 3 * t.fg).all()
    assert (dk <= t.xp_made + 5 * t.fg).all()
