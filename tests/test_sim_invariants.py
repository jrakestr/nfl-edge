"""Spec for sim/game.py and sim/players.py. Written before the simulator; must fail first.

Interfaces under test:
    game.TeamPrior(team, drives_mean, plays_per_drive, neutral_pass_rate, off_ppd, def_ppd_allowed,
                   fg_per_drive, pass_td_share, int_rate, sack_rate)
    game.GameContext(home_field_pts, rest_diff_days, wind_mph, roof)
    game.simulate_game(home, away, ctx, n, rng, cfg, league) -> GameDraws
        GameDraws.home / .away: TeamDraws with int arrays of length n:
            drives, plays, pass_att, rush_att, sacks, td, pass_td, rush_td, fg, pts, int
            and float array plays_per_drive (the per-draw pace used to build plays)
        GameDraws.ppd_adj: {"home": float, "away": float}   matchup-adjusted points per drive
        GameDraws.drives_mean: float                          E[drives] per team
    players.validate_usage(usage) -> None | raises ValueError when shares do not sum to 1 per team
    players.allocate(team_draws, usage, efficiency, cfg, rng) -> PlayerDraws
        PlayerDraws.player_ids: list[str]; arrays shape (n_players, n):
            pass_att, cmp, pass_yds, pass_td, int, carries, rush_yds, rush_td,
            targets, rec, rec_yds, rec_td, fum_lost
"""
import numpy as np
import polars as pl
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.sim import game, players

CFG = load_yaml("sim.yaml")
LEAGUE = {"drives_mean": 10.8, "plays_per_drive": 5.7, "neutral_pass_rate": 0.59, "off_ppd": 2.13,
          "def_ppd_allowed": 2.13, "fg_per_drive": 0.16, "pass_td_share": 0.62, "int_rate": 0.021,
          "sack_rate": 0.066}
N = 2000


def _team(name, off_ppd=2.13, def_ppd=2.13, drives=10.8, ppd=5.7, pass_rate=0.59):
    return game.TeamPrior(team=name, drives_mean=drives, plays_per_drive=ppd,
                          neutral_pass_rate=pass_rate, off_ppd=off_ppd, def_ppd_allowed=def_ppd,
                          fg_per_drive=0.16, pass_td_share=0.62, int_rate=0.021, sack_rate=0.066)


def _ctx(**kw):
    base = {"home_field_pts": 0.0, "rest_diff_days": 0, "wind_mph": 0.0, "roof": "outdoors"}
    base.update(kw)
    return game.GameContext(**base)


def _usage(team):
    rows = [  # player, pos, is_qb1, target_share, carry_share, rz_target_share, rz_carry_share
        ("qb", "QB", True, 0.00, 0.10, 0.00, 0.12),
        ("rb1", "RB", False, 0.12, 0.55, 0.10, 0.60),
        ("rb2", "RB", False, 0.05, 0.30, 0.05, 0.25),
        ("wr1", "WR", False, 0.28, 0.02, 0.30, 0.01),
        ("wr2", "WR", False, 0.20, 0.02, 0.20, 0.01),
        ("wr3", "WR", False, 0.15, 0.01, 0.15, 0.01),
        ("te1", "TE", False, 0.20, 0.00, 0.20, 0.00),
    ]
    return pl.DataFrame(
        rows, orient="row",
        schema=["player_id", "position", "is_qb1", "target_share", "carry_share",
                "rz_target_share", "rz_carry_share"],
    ).with_columns(pl.lit(team).alias("team"), (pl.lit(team) + "_" + pl.col("player_id")).alias("player_id"))


def _efficiency(team):
    u = _usage(team)
    return u.select("player_id").with_columns(
        pl.lit(0.68).alias("catch_rate"), pl.lit(11.5).alias("yds_per_rec"),
        pl.lit(7.8).alias("yds_per_target"), pl.lit(4.3).alias("yds_per_carry"),
        pl.lit(0.05).alias("td_per_target"), pl.lit(0.03).alias("td_per_carry"),
    )


@pytest.fixture(scope="module")
def draws():
    rng = np.random.default_rng(7)
    return game.simulate_game(_team("HOME"), _team("AWAY"), _ctx(), N, rng, CFG, LEAGUE)


@pytest.fixture(scope="module")
def home_players(draws):
    rng = np.random.default_rng(11)
    return players.allocate(draws.home, _usage("HOME"), _efficiency("HOME"), CFG, rng)


# ---------------------------------------------------------------- game-level invariants

def test_shapes_and_integers(draws):
    for t in (draws.home, draws.away):
        for name in ("drives", "plays", "pass_att", "rush_att", "sacks", "td", "pass_td", "rush_td",
                     "fg", "pts", "int"):
            arr = getattr(t, name)
            assert arr.shape == (N,), name
            assert np.issubdtype(arr.dtype, np.integer), name
            assert (arr >= 0).all(), name


def test_drives_plays_coupling_exact(draws):
    for t in (draws.home, draws.away):
        assert (t.plays == np.round(t.drives * t.plays_per_drive)).all()
        assert t.drives.min() >= 6 and t.drives.max() <= 16
        assert (t.pass_att + t.rush_att + t.sacks == t.plays).all()


def test_scoring_decomposition_exact(draws):
    for t in (draws.home, draws.away):
        assert (t.td == t.pass_td + t.rush_td).all()
        assert (t.fg + t.td <= t.drives).all()
        # 6 per TD + 3 per FG, plus 0/1/2 per TD from XP / 2-pt outcomes
        assert (t.pts >= 6 * t.td + 3 * t.fg).all()
        assert (t.pts <= 8 * t.td + 3 * t.fg).all()


def test_mean_points_match_ppd_adj(draws):
    for side in ("home", "away"):
        t = getattr(draws, side)
        expected = draws.drives_mean * draws.ppd_adj[side]
        assert abs(t.pts.mean() - expected) < 1.5, (side, t.pts.mean(), expected)
        assert abs(t.plays.mean() - draws.drives_mean * 5.7) < 2.0


def test_fg_rate_held_fixed(draws):
    for t in (draws.home, draws.away):
        assert abs(t.fg.mean() / t.drives.mean() - 0.16) < 0.02


def test_home_field_shifts_spread_only():
    rng = np.random.default_rng(3)
    d = game.simulate_game(_team("H"), _team("A"), _ctx(home_field_pts=3.0), N, rng, CFG, LEAGUE)
    assert d.ppd_adj["home"] > d.ppd_adj["away"]
    assert (d.home.pts.mean() - d.away.pts.mean()) > 1.0


def test_spread_and_total_monotone_in_strength():
    margins, totals = [], []
    for off in (1.7, 2.13, 2.6):
        rng = np.random.default_rng(5)
        d = game.simulate_game(_team("H", off_ppd=off), _team("A"), _ctx(), N, rng, CFG, LEAGUE)
        margins.append((d.home.pts - d.away.pts).mean())
        totals.append((d.home.pts + d.away.pts).mean())
    assert margins[0] < margins[1] < margins[2]
    assert totals[0] < totals[1] < totals[2]


def test_defense_matters():
    rng = np.random.default_rng(9)
    soft = game.simulate_game(_team("H"), _team("A", def_ppd=2.6), _ctx(), N, rng, CFG, LEAGUE)
    rng = np.random.default_rng(9)
    stiff = game.simulate_game(_team("H"), _team("A", def_ppd=1.7), _ctx(), N, rng, CFG, LEAGUE)
    assert soft.home.pts.mean() > stiff.home.pts.mean() + 2


def test_game_script_trailing_team_passes_more(draws):
    margin = draws.home.pts - draws.away.pts
    pr = draws.home.pass_att / np.maximum(draws.home.plays, 1)
    assert pr[margin < -7].mean() > pr[margin > 7].mean()


def test_seed_reproducible():
    a = game.simulate_game(_team("H"), _team("A"), _ctx(), 200, np.random.default_rng(1), CFG, LEAGUE)
    b = game.simulate_game(_team("H"), _team("A"), _ctx(), 200, np.random.default_rng(1), CFG, LEAGUE)
    assert (a.home.pts == b.home.pts).all() and (a.away.plays == b.away.plays).all()


# ---------------------------------------------------------------- player-level invariants

def test_usage_shares_sum_to_one():
    players.validate_usage(_usage("HOME"))
    bad = _usage("HOME").with_columns((pl.col("target_share") * 1.1).alias("target_share"))
    with pytest.raises(ValueError):
        players.validate_usage(bad)


def test_player_td_sum_equals_team_td_every_draw(draws, home_players):
    p = home_players
    assert (p.rec_td.sum(axis=0) == draws.home.pass_td).all()
    assert (p.rush_td.sum(axis=0) == draws.home.rush_td).all()
    assert (p.rec_td.sum(axis=0) + p.rush_td.sum(axis=0) == draws.home.td).all()


def test_qb_totals_equal_receiver_sums_every_draw(draws, home_players):
    p = home_players
    qb = p.player_ids.index("HOME_qb")
    assert (p.pass_att[qb] == draws.home.pass_att).all()
    assert (p.pass_yds[qb] == p.rec_yds.sum(axis=0)).all()
    assert (p.cmp[qb] == p.rec.sum(axis=0)).all()
    assert (p.pass_td[qb] == p.rec_td.sum(axis=0)).all()
    assert (p.int[qb] == draws.home.int).all()
    non_qb = [i for i in range(len(p.player_ids)) if i != qb]
    assert (p.pass_att[non_qb] == 0).all()


def test_opportunity_totals_every_draw(draws, home_players):
    p = home_players
    assert (p.targets.sum(axis=0) == draws.home.pass_att).all()
    assert (p.carries.sum(axis=0) == draws.home.rush_att).all()
    assert (p.rec <= p.targets).all()
    assert (p.rec_td <= p.rec).all()
    assert (p.rush_td <= p.carries).all()
    assert (p.fum_lost <= p.carries + p.rec).all()


def test_allocation_tracks_shares(draws, home_players):
    p = home_players
    ids = p.player_ids
    tgt_share = p.targets.sum(axis=1) / p.targets.sum()
    assert abs(tgt_share[ids.index("HOME_wr1")] - 0.28) < 0.03
    car_share = p.carries.sum(axis=1) / p.carries.sum()
    assert abs(car_share[ids.index("HOME_rb1")] - 0.55) < 0.03
    # efficiency: catch rate and yards per reception near priors
    assert abs(p.rec.sum() / p.targets.sum() - 0.68) < 0.03
    assert abs(p.rec_yds.sum() / p.rec.sum() - 11.5) < 0.8
    assert abs(p.rush_yds.sum() / p.carries.sum() - 4.3) < 0.4


def test_two_passers_still_sum_to_receivers_every_draw(draws):
    """priors-refine: qb_att_share < 1 routes a share of attempts to QB2 with exact sums."""
    u = _usage("HOME")
    qb2 = pl.DataFrame({"player_id": ["HOME_qb2"], "position": ["QB"], "is_qb1": [False],
                        "target_share": [0.0], "carry_share": [0.0], "rz_target_share": [0.0],
                        "rz_carry_share": [0.0], "team": ["HOME"]})
    u = pl.concat([u, qb2.select(u.columns)]).with_columns(
        (pl.col("player_id") == "HOME_qb2").alias("is_qb2"), pl.lit(0.85).alias("qb_att_share"))
    eff = _efficiency("HOME")
    p = players.allocate(draws.home, u, eff, CFG, np.random.default_rng(13))
    q1, q2 = p.player_ids.index("HOME_qb"), p.player_ids.index("HOME_qb2")
    assert (p.pass_att[q1] + p.pass_att[q2] == draws.home.pass_att).all()
    assert (p.pass_yds[q1] + p.pass_yds[q2] == p.rec_yds.sum(axis=0)).all()
    assert (p.cmp[q1] + p.cmp[q2] == p.rec.sum(axis=0)).all()
    assert (p.pass_td[q1] + p.pass_td[q2] == p.rec_td.sum(axis=0)).all()
    assert (p.int[q1] + p.int[q2] == draws.home.int).all()
    assert (p.pass_att >= 0).all() and (p.cmp <= p.pass_att).all() and (p.pass_td <= p.cmp).all()
    assert abs(p.pass_att[q1].sum() / draws.home.pass_att.sum() - 0.85) < 0.02


def test_player_arrays_shape_and_dtype(home_players):
    p = home_players
    n_players = len(p.player_ids)
    for name in ("pass_att", "cmp", "pass_td", "int", "carries", "rush_td", "targets", "rec",
                 "rec_td", "fum_lost"):
        arr = getattr(p, name)
        assert arr.shape == (n_players, N) and np.issubdtype(arr.dtype, np.integer), name
    for name in ("pass_yds", "rush_yds", "rec_yds"):
        assert getattr(p, name).shape == (n_players, N), name
