"""Spec for the realized-outcome calibration layer and the untargeted-attempt fix.

Interfaces under test:
    players.allocate(..., target_rate=r): team targets ~ Bin(pass_att, r); QB keeps every attempt
    priors.role.recent_offense_share(rows, games) -> {player_id: best offense share}
    priors.calibration.fit(cells, k) -> factors (1.0 = no change; none without evidence)
    priors.calibration.apply_usage(usage, factors, shares, starters, min_pct) -> usage
    priors.calibration.apply_teams(teams, factors) -> teams
"""
import numpy as np
import polars as pl
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.priors import calibration as K
from nfl_edge.priors import role
from nfl_edge.sim import game, players

CFG = load_yaml("sim.yaml")


# --------------------------------------------------------------- untargeted attempts

def _draws(n=3000):
    tp = game.TeamPrior(team="H", drives_mean=10.8, plays_per_drive=5.7, neutral_pass_rate=0.59,
                        off_ppd=2.13, def_ppd_allowed=2.13, fg_per_drive=0.16, pass_td_share=0.62,
                        int_rate=0.021, sack_rate=0.066)
    ctx = game.GameContext(home_field_pts=0.0, rest_diff_days=0, wind_mph=0.0, roof="outdoors")
    return game.simulate_game(tp, tp, ctx, n, np.random.default_rng(2), CFG,
                              {"drives_mean": 10.8, "off_ppd": 2.13, "def_ppd_allowed": 2.13})


def _usage(qb2=False):
    rows = [("qb", "QB", True, False, 0.0, 0.10, 0.0, 0.12),
            ("qb2", "QB", False, True, 0.0, 0.0, 0.0, 0.0),
            ("rb", "RB", False, False, 0.15, 0.80, 0.15, 0.80),
            ("wr", "WR", False, False, 0.55, 0.10, 0.55, 0.08),
            ("te", "TE", False, False, 0.30, 0.0, 0.30, 0.0)]
    if not qb2:
        rows = [r for r in rows if r[0] != "qb2"]
    return pl.DataFrame(rows, orient="row", schema=[
        "player_id", "position", "is_qb1", "is_qb2", "target_share", "carry_share",
        "rz_target_share", "rz_carry_share"]).with_columns(pl.lit("H").alias("team"))


def _eff(u):
    return u.select("player_id").with_columns(
        pl.lit(0.66).alias("catch_rate"), pl.lit(11.0).alias("yds_per_rec"),
        pl.lit(4.3).alias("yds_per_carry"))


def test_targets_thinned_but_qb_keeps_every_attempt():
    d = _draws()
    u = _usage()
    p = players.allocate(d.home, u, _eff(u), CFG, np.random.default_rng(3), target_rate=0.953)
    qb = p.player_ids.index("qb")
    assert (p.targets.sum(axis=0) <= d.home.pass_att).all()
    assert abs(p.targets.sum() / d.home.pass_att.sum() - 0.953) < 0.01
    assert (p.pass_att[qb] == d.home.pass_att).all()
    assert (p.cmp[qb] == p.rec.sum(axis=0)).all()
    assert (p.pass_yds[qb] == p.rec_yds.sum(axis=0)).all()
    assert (p.pass_td[qb] == p.rec_td.sum(axis=0)).all()


def test_two_passers_still_own_every_attempt_with_untargeted_throws():
    d = _draws()
    u = _usage(qb2=True).with_columns(pl.lit(0.85).alias("qb_att_share"))
    p = players.allocate(d.home, u, _eff(u), CFG, np.random.default_rng(4), target_rate=0.953)
    q1, q2 = p.player_ids.index("qb"), p.player_ids.index("qb2")
    assert (p.pass_att[q1] + p.pass_att[q2] == d.home.pass_att).all()
    assert (p.cmp[q1] + p.cmp[q2] == p.rec.sum(axis=0)).all()
    assert (p.pass_yds[q1] + p.pass_yds[q2] == p.rec_yds.sum(axis=0)).all()


def test_default_target_rate_keeps_old_behavior():
    d = _draws(500)
    u = _usage()
    p = players.allocate(d.home, u, _eff(u), CFG, np.random.default_rng(3))
    assert (p.targets.sum(axis=0) == d.home.pass_att).all()


# --------------------------------------------------------------- role shares

def test_recent_offense_share_uses_the_teams_last_games():
    rows = [{"player_id": "a", "team": "SF", "week": w, "offense_pct": pct}
            for w, pct in ((2, 0.15), (3, 0.0), (5, 0.0))]
    rows.append({"player_id": "b", "team": "SF", "week": 1, "offense_pct": 0.6})
    assert role.recent_offense_share(rows, games=3) == {"a": 0.15}
    assert role.recent_offense_share(rows, games=2) == {"a": 0.0}


# --------------------------------------------------------------- fitting

def _cells(n_games=100, proj_pa=34.0, act_pa=32.0, proj_car=26.0, act_car=27.0,
           proj_qbc=5.5, act_qbc=4.0, proj_t=(6.0, 19.0, 9.0), act_t=(5.6, 18.0, 7.4)):
    return [{"proj_pass_att": proj_pa, "act_pass_att": act_pa, "proj_carries": proj_car,
             "act_carries": act_car, "proj_qb_carries": proj_qbc, "act_qb_carries": act_qbc,
             "proj_rb_targets": proj_t[0], "act_rb_targets": act_t[0],
             "proj_wr_targets": proj_t[1], "act_wr_targets": act_t[1],
             "proj_te_targets": proj_t[2], "act_te_targets": act_t[2]} for _ in range(n_games)]


def test_fit_without_evidence_is_no_change():
    f = K.fit([], k=32)
    assert f == K.NO_CHANGE


def test_fit_ratios_shrunk_by_sample_size():
    f = K.fit(_cells(n_games=96), k=32)          # weight 96 / 128 = 0.75
    raw_pass = (32 / 59) / (34 / 60)
    assert f["pass_rate"] == pytest.approx(1 + 0.75 * (raw_pass - 1))
    assert f["qb_carry"] == pytest.approx(1 + 0.75 * (4.0 / 5.5 - 1))
    raw_te = (7.4 / 31.0) / (9.0 / 34.0)
    assert f["target_TE"] == pytest.approx(1 + 0.75 * (raw_te - 1))


def test_fit_clips_extreme_ratios():
    f = K.fit(_cells(n_games=10_000, proj_qbc=5.0, act_qbc=1.0), k=32)
    assert f["qb_carry"] == pytest.approx(K.CLIP[0])


# --------------------------------------------------------------- applying

def _team_usage():
    return pl.DataFrame({
        "team": ["SF"] * 6,
        "player_id": ["qb", "rb1", "rb3", "wr1", "wr2", "te1"],
        "position": ["QB", "RB", "RB", "WR", "WR", "TE"],
        "target_share": [0.0, 0.15, 0.05, 0.35, 0.20, 0.25],
        "carry_share": [0.15, 0.60, 0.20, 0.05, 0.0, 0.0],
        "rz_target_share": [0.0, 0.15, 0.05, 0.35, 0.20, 0.25],
        "rz_carry_share": [0.15, 0.60, 0.20, 0.05, 0.0, 0.0],
    })


def test_apply_usage_scales_and_renormalizes():
    f = {**K.NO_CHANGE, "qb_carry": 0.7, "target_TE": 0.9}
    out = K.apply_usage(_team_usage(), f, shares={}, starters=set(), min_pct=0.10)
    for c in ("target_share", "carry_share", "rz_target_share", "rz_carry_share"):
        assert out[c].sum() == pytest.approx(1.0)
    by = {r["player_id"]: r for r in out.to_dicts()}
    assert by["qb"]["carry_share"] < 0.15 and by["rb1"]["carry_share"] > 0.60
    assert by["te1"]["target_share"] < 0.25


def test_apply_usage_zeroes_players_without_an_offensive_role():
    out = K.apply_usage(_team_usage(), K.NO_CHANGE, shares={"rb3": 0.0, "wr2": 0.4},
                        starters=set(), min_pct=0.10)
    by = {r["player_id"]: r for r in out.to_dicts()}
    assert by["rb3"]["carry_share"] == 0 and by["rb3"]["target_share"] == 0
    assert out["carry_share"].sum() == pytest.approx(1.0)
    # a starter is never zeroed, and no evidence means no change
    kept = K.apply_usage(_team_usage(), K.NO_CHANGE, shares={"rb3": 0.0}, starters={"rb3"},
                         min_pct=0.10)
    assert kept.filter(pl.col("player_id") == "rb3")["carry_share"][0] > 0


def test_apply_teams_scales_pass_rate():
    teams = pl.DataFrame({"team": ["SF"], "neutral_pass_rate": [0.60]})
    out = K.apply_teams(teams, {**K.NO_CHANGE, "pass_rate": 0.95})
    assert out["neutral_pass_rate"][0] == pytest.approx(0.57)
