"""Priors v1: shrinkage moves toward the league mean with fewer games; leakage filter; weights.

Uses the pure builders (team.build, common.*) on synthetic team-game rows; no database.
The overrides test lands with priors-refine.
"""
import math

import polars as pl
import pytest

from nfl_edge.priors import common, efficiency, qb, team, usage

CFG = {"lookback_weeks": 8, "prior_season_weight": 0.35, "shrink_k_team": 4}

# a league of two "average" teams plus one hot team; per-game columns team.build needs
COLS = ["season", "week", "team", "plays", "drives", "points", "fg_made", "td", "pass_td", "pass_att",
        "dropbacks", "sacks", "interceptions", "neutral_pass_rate", "opp_points", "opp_drives"]


def _game(season, week, tm, points=24, drives=11, opp_points=24):
    return (season, week, tm, 63, drives, points, 2, 2, 1, 35, 37, 2, 1, 0.58, opp_points, drives)


def _frame(hot_weeks: int, hot_points: int = 40) -> pl.DataFrame:
    rows = []
    for w in range(1, 9):
        rows.append(_game(2025, w, "AVG1"))
        rows.append(_game(2025, w, "AVG2"))
    for w in range(1, hot_weeks + 1):
        rows.append(_game(2025, w, "HOT", points=hot_points))
    return pl.DataFrame(rows, orient="row", schema=COLS)


def _ppd(games: pl.DataFrame, tm: str, week: int = 9) -> tuple[float, float]:
    p = team.build(games, 2025, week, CFG)
    row = p.teams.filter(pl.col("team") == tm).row(0, named=True)
    return row["off_ppd"], p.league["off_ppd"]


def test_fewer_games_shrinks_closer_to_league():
    raw_hot = 40 / 11
    dists = []
    for n in (1, 3, 8):
        ppd, league = _ppd(_frame(n), "HOT")
        assert league < ppd < raw_hot            # between league mean and raw rate
        dists.append(raw_hot - ppd)
    assert dists[0] > dists[1] > dists[2]        # more games -> less shrinkage


def test_team_at_league_mean_is_unchanged_by_shrinkage():
    ppd, league = _ppd(_frame(0), "AVG1")       # league of identical teams
    assert ppd == pytest.approx(league, abs=1e-9)
    assert league == pytest.approx(24 / 11)


def test_shrink_weight_formula():
    df = pl.DataFrame({"v": [1.0, 1.0, float("nan"), None], "n": [4.0, 0.0, 4.0, 4.0]})
    out = df.select(common.shrink(pl.col("v"), pl.col("n"), 0.0, 4.0).alias("s"))["s"].to_list()
    assert out[0] == pytest.approx(0.5)          # n == k -> halfway
    assert out[1] == pytest.approx(0.0)          # no data -> target
    assert out[2] == pytest.approx(0.0)          # 0/0 -> target
    assert out[3] == pytest.approx(0.0)


def test_recency_weights_and_prior_season():
    df = pl.DataFrame({"season": [2025, 2025, 2024], "week": [8, 1, 17]})
    w = common.with_weights(df, 2025, 9, CFG)["w"].to_list()
    assert w[0] == pytest.approx(math.exp(-1 / 8))
    assert w[1] == pytest.approx(math.exp(-8 / 8))
    assert w[0] > w[1]
    assert w[2] == pytest.approx(0.35)


def test_history_filter_excludes_target_week_and_future():
    where = common.history_where(2025, 9, "a")
    assert where == "((a.season = 2024 and a.week <> 18) or (a.season = 2025 and a.week < 9))"
    df = pl.DataFrame({"season": [2024, 2024, 2025, 2025, 2025, 2026], "week": [17, 18, 8, 9, 10, 1]})
    kept = common.drop_prior_week18(df, 2025).filter(
        (pl.col("season") == 2024) | ((pl.col("season") == 2025) & (pl.col("week") < 9))
    )
    assert kept["week"].to_list() == [17, 8]


def test_history_filter_excludes_prior_season_week_18():
    where = common.history_where(2026, 1)
    assert "week <> 18" in where
    df = pl.DataFrame({"season": [2025, 2025, 2025, 2026], "week": [17, 18, 1, 1]})
    kept = common.drop_prior_week18(df, 2026)
    assert kept.filter(pl.col("season") == 2025)["week"].to_list() == [17, 1]
    # team builder must not let a prior-season week-18 blowout into n_eff or the rate
    rows = [_game(2025, w, "AVG1") for w in range(1, 9)]
    rows += [_game(2025, w, "AVG2") for w in range(1, 9)]
    rows += [_game(2024, w, "HOT", points=24) for w in range(1, 18)]
    rows.append(_game(2024, 18, "HOT", points=80))
    p = team.build(pl.DataFrame(rows, orient="row", schema=COLS), 2025, 9, CFG)
    hot = p.teams.filter(pl.col("team") == "HOT").row(0, named=True)
    g = common.with_weights(
        common.drop_prior_week18(pl.DataFrame(rows, orient="row", schema=COLS), 2025)
        .filter(pl.col("team") == "HOT"),
        2025, 9, CFG,
    )
    assert hot["n_eff"] == pytest.approx(float(g["w"].sum()))
    assert 18 not in common.with_weights(
        pl.DataFrame(rows, orient="row", schema=COLS), 2025, 9, CFG
    ).filter(pl.col("team") == "HOT")["week"].to_list()


def test_league_anchor_is_unshrunk_pooled_ratio():
    g = _frame(8)
    p = team.build(g, 2025, 9, CFG)
    assert p.league["off_ppd"] == pytest.approx((24 * 16 + 40 * 8) / (11 * 24))


# ---------------------------------------------------------------- priors-refine: usage overrides,
# depth-chart cold start, QB channel

UCFG = {**CFG, "shrink_k_usage": 3, "cold_start_frac": 0.6,
        "cold_start_rank_factor": {1: 1.0, 2: 0.6, 3: 0.35, 4: 0.20, 5: 0.12},
        "shrink_k_qb_att": 150, "qb_factor_clip": [0.8, 1.2], "qb_att_share_prior": 0.97, "shrink_k_qb_share": 3}
PW_COLS = ["season", "week", "player_id", "team", "position", "targets", "carries", "attempts",
           "team_targets", "team_carries", "rec_td_exp", "rush_td_exp", "team_rec_td_exp",
           "team_rush_td_exp", "offense_pct"]


def _pw():
    rows = []
    for w in range(1, 9):
        # team T: qb, two WR, one RB; team targets 30, carries 25
        rows += [
            (2025, w, "qb", "T", "QB", 0, 3, 30, 30, 25, 0.0, 0.1, 1.0, 1.0, 1.0),
            (2025, w, "wr1", "T", "WR", 18, 0, 0, 30, 25, 0.6, 0.0, 1.0, 1.0, 0.9),
            (2025, w, "wr2", "T", "WR", 12, 0, 0, 30, 25, 0.4, 0.0, 1.0, 1.0, 0.8),
            (2025, w, "rb1", "T", "RB", 0, 22, 0, 30, 25, 0.0, 0.9, 1.0, 1.0, 0.7),
        ]
    return pl.DataFrame(rows, orient="row", schema=PW_COLS)


def _roster(extra=()):
    base = [("T", "qb", "QB", "QB One"), ("T", "wr1", "WR", "WR One"), ("T", "wr2", "WR", "WR Two"),
            ("T", "rb1", "RB", "RB One"), *extra]
    return pl.DataFrame(base, orient="row", schema=["team", "player_id", "position", "full_name"])


def test_override_out_zeroes_player_and_renormalizes():
    ov = pl.DataFrame({"player_id": ["wr1"], "status": ["out"], "usage_multiplier": [1.0]})
    u = usage.build(_pw(), _roster(), 2025, 9, UCFG, overrides=ov)
    assert u.filter(pl.col("player_id") == "wr1")["target_share"][0] == 0.0
    assert u.filter(pl.col("player_id") == "wr2")["target_share"][0] == pytest.approx(1.0)
    assert u["target_share"].sum() == pytest.approx(1.0)


def test_override_multiplier_scales_before_renorm():
    base = usage.build(_pw(), _roster(), 2025, 9, UCFG)
    ov = pl.DataFrame({"player_id": ["wr2"], "status": ["active"], "usage_multiplier": [1.5]})
    u = usage.build(_pw(), _roster(), 2025, 9, UCFG, overrides=ov)
    b1 = base.filter(pl.col("player_id") == "wr2")["target_share"][0]
    b2 = u.filter(pl.col("player_id") == "wr2")["target_share"][0]
    assert b2 > b1 and u["target_share"].sum() == pytest.approx(1.0)


def test_depth_chart_cold_start_adds_rostered_player_without_history():
    depth = pl.DataFrame({"player_id": ["wr3", "wr1", "wr2"], "depth_rank": [3, 1, 2]})
    u = usage.build(_pw(), _roster(extra=[("T", "wr3", "WR", "WR Three")]), 2025, 9, UCFG, depth=depth)
    wr3 = u.filter(pl.col("player_id") == "wr3")
    assert wr3.height == 1 and 0 < wr3["target_share"][0] < u.filter(pl.col("player_id") == "wr2")["target_share"][0]
    assert u["target_share"].sum() == pytest.approx(1.0)
    # without a depth chart the same player is excluded
    assert usage.build(_pw(), _roster(extra=[("T", "wr3", "WR", "WR Three")]), 2025, 9, UCFG) \
        .filter(pl.col("player_id") == "wr3").is_empty()


def test_depth_chart_cold_start_includes_ranks_4_and_5():
    depth = pl.DataFrame({
        "player_id": ["wr3", "wr4", "wr5", "wr6"],
        "depth_rank": [3, 4, 5, 6],
    })
    extra = [
        ("T", "wr3", "WR", "WR Three"),
        ("T", "wr4", "WR", "WR Four"),
        ("T", "wr5", "WR", "WR Five"),
        ("T", "wr6", "WR", "WR Six"),
    ]
    u = usage.build(_pw(), _roster(extra=extra), 2025, 9, UCFG, depth=depth)
    wr3 = u.filter(pl.col("player_id") == "wr3")["target_share"][0]
    wr4 = u.filter(pl.col("player_id") == "wr4")["target_share"][0]
    wr5 = u.filter(pl.col("player_id") == "wr5")["target_share"][0]
    assert u.filter(pl.col("player_id") == "wr4").height == 1
    assert u.filter(pl.col("player_id") == "wr5").height == 1
    assert u.filter(pl.col("player_id") == "wr6").is_empty()
    assert 0 < wr5 < wr4 < wr3
    assert u["target_share"].sum() == pytest.approx(1.0)


def test_announced_starter_beats_attempts_for_qb1():
    ros = _roster(extra=[("T", "qb2", "QB", "QB Two")])
    u = usage.build(_pw(), ros, 2025, 9, UCFG)                      # no starters -> most attempts
    assert u.filter(pl.col("is_qb1"))["player_id"].to_list() == ["qb"]
    depth = pl.DataFrame({"player_id": ["qb2"], "depth_rank": [1]})
    st = pl.DataFrame({"team": ["T"], "qb_id": ["qb2"]})
    u = usage.build(_pw(), ros, 2025, 9, UCFG, starters=st, depth=depth)
    assert u.filter(pl.col("is_qb1"))["player_id"].to_list() == ["qb2"]
    assert u.filter(pl.col("is_qb2"))["player_id"].to_list() == ["qb"]
    ov = pl.DataFrame({"player_id": ["qb2"], "status": ["out"], "usage_multiplier": [1.0]})
    u = usage.build(_pw(), ros, 2025, 9, UCFG, starters=st, overrides=ov)
    assert u.filter(pl.col("is_qb1"))["player_id"].to_list() == ["qb"]   # out starter falls back


def _qb_weeks(ypa_starter=8.0, ypa_league=7.0):
    rows = []
    for w in range(1, 9):
        rows.append((2025, w, "star", "T", 30.0, 30 * ypa_starter, 31.0, 30 * ypa_starter + 7.0))
        rows.append((2025, w, "mop", "T", 1.0, 7.0, 31.0, 30 * ypa_starter + 7.0))
        rows.append((2025, w, "avg", "U", 30.0, 30 * ypa_league, 30.0, 30 * ypa_league))
    return pl.DataFrame(rows, orient="row", schema=["season", "week", "player_id", "team", "attempts",
                                                    "pass_yds", "team_attempts", "team_pass_yds"])


def test_qb_factor_is_one_for_the_qb_who_produced_the_lookback_and_below_one_for_a_backup():
    st = pl.DataFrame({"team": ["T"], "qb_id": ["star"]})
    fb = pl.DataFrame({"team": ["T"], "player_id": ["star"]})
    q = qb.build(_qb_weeks(), st, fb, 2025, 9, UCFG).row(0, named=True)
    assert q["qb_pass_factor"] == pytest.approx(1.0, abs=0.02)
    assert 0.9 < q["qb_att_share"] < 1.0
    backup = pl.DataFrame({"team": ["T"], "qb_id": ["newguy"]})     # no history -> league YPA
    q2 = qb.build(_qb_weeks(), backup, fb, 2025, 9, UCFG).row(0, named=True)
    assert q2["qb_pass_factor"] < q["qb_pass_factor"] - 0.02   # league-YPA backup behind a good starter
    assert q2["qb_att_share"] == pytest.approx(0.97)
    assert q2["qb_id"] == "newguy"


def test_qb_starter_falls_back_when_schedule_has_none():
    st = pl.DataFrame(schema={"team": pl.Utf8, "qb_id": pl.Utf8})
    fb = pl.DataFrame({"team": ["T"], "player_id": ["star"]})
    assert qb.build(_qb_weeks(), st, fb, 2025, 9, UCFG)["qb_id"].to_list() == ["star"]


# ---------------------------------------------------------------- n_eff is unweighted sample size; recency stays on the rate

ECFG = {**UCFG, "shrink_k_targets": 40, "shrink_k_carries": 60, "shrink_to_ffopportunity": 0.0}


def _week1_usage_pw(*, star_games: int = 17, rook_games: int = 0):
    """2025-only history for a 2026 week-1 prior. Star/wr2 on T; two average WRs set the positional mean."""
    rows = []
    for w in range(1, 18):
        rows += [
            (2025, w, "avg1", "U", "WR", 9, 0, 0, 30, 25, 0.3, 0.0, 1.0, 1.0, 0.7),
            (2025, w, "avg2", "U", "WR", 9, 0, 0, 30, 25, 0.3, 0.0, 1.0, 1.0, 0.6),
            (2025, w, "qb", "T", "QB", 0, 3, 30, 30, 25, 0.0, 0.1, 1.0, 1.0, 1.0),
            (2025, w, "rb1", "T", "RB", 0, 22, 0, 30, 25, 0.0, 0.9, 1.0, 1.0, 0.7),
        ]
        if w <= star_games:
            rows.append((2025, w, "wr1", "T", "WR", 18, 0, 0, 30, 25, 0.6, 0.0, 1.0, 1.0, 0.9))
            rows.append((2025, w, "wr2", "T", "WR", 12, 0, 0, 30, 25, 0.4, 0.0, 1.0, 1.0, 0.8))
        if w <= rook_games:
            rows.append((2025, w, "rook", "T", "WR", 18, 0, 0, 30, 25, 0.6, 0.0, 1.0, 1.0, 0.9))
    extra = (("T", "rook", "WR", "Rookie"),) if rook_games else ()
    return pl.DataFrame(rows, orient="row", schema=PW_COLS), _roster(extra=extra)


def test_week1_starter_usage_lambda_is_unweighted_game_count():
    pw, ros = _week1_usage_pw(star_games=17)
    u = usage.build(pw, ros, 2026, 1, UCFG)
    star = u.filter(pl.col("player_id") == "wr1").row(0, named=True)
    wr2 = u.filter(pl.col("player_id") == "wr2").row(0, named=True)
    assert star["n_eff"] == 17.0
    lam = 17.0 / (17.0 + UCFG["shrink_k_usage"])
    assert lam == pytest.approx(0.85)
    # four WRs at n_eff=17: shares 0.6, 0.4, 0.3, 0.3 → positional mean 0.4
    # pre-renorm star 0.85*0.6+0.15*0.4 = 0.57; wr2 0.85*0.4+0.15*0.4 = 0.40
    assert star["target_share"] == pytest.approx(0.57 / (0.57 + 0.40))
    assert wr2["target_share"] == pytest.approx(0.40 / (0.57 + 0.40))


def test_three_game_rookie_shrinks_harder_than_full_starter():
    pw, ros = _week1_usage_pw(star_games=17, rook_games=3)
    u = usage.build(pw, ros, 2026, 1, UCFG)
    star = u.filter(pl.col("player_id") == "wr1").row(0, named=True)
    rook = u.filter(pl.col("player_id") == "rook").row(0, named=True)
    assert rook["n_eff"] == 3.0
    assert star["n_eff"] == 17.0
    # same raw 18/30 share; rook λ=3/6 keeps half, so less of the star rate after shrink+renorm
    assert rook["target_share"] < star["target_share"] - 0.02


def test_team_neff_is_weighted_sum_not_game_count():
    """Team strength shrinks with recency-weighted n_eff; the rate itself stays weighted."""
    rows = []
    for w in range(1, 9):
        rows.append(_game(2025, w, "AVG1"))
        rows.append(_game(2025, w, "AVG2"))
        rows.append(_game(2024, w, "HOT", points=24))   # stale, w=0.35
        rows.append(_game(2025, w, "HOT", points=40))   # current, recency > 0.35
    games = pl.DataFrame(rows, orient="row", schema=COLS)
    p = team.build(games, 2025, 9, CFG)
    hot = p.teams.filter(pl.col("team") == "HOT").row(0, named=True)
    g = common.with_weights(games.filter(pl.col("team") == "HOT"), 2025, 9, CFG).with_columns(
        pl.lit(1.0).alias("games")
    )
    n_w = float(g["w"].sum())
    assert hot["n_eff"] == pytest.approx(n_w)
    assert hot["n_eff"] < 16.0                         # not the unweighted game count
    weighted = float(g.select(common.weighted_ratio("points", "drives")).item())
    k = float(CFG["shrink_k_team"])
    lam = n_w / (n_w + k)
    expected = lam * weighted + (1 - lam) * p.league["off_ppd"]
    assert hot["off_ppd"] == pytest.approx(expected)
    # unweighted-count λ would keep more of the hot rate
    lam_games = 16.0 / (16.0 + k)
    assert hot["off_ppd"] != pytest.approx(lam_games * weighted + (1 - lam_games) * p.league["off_ppd"])


def test_efficiency_neff_is_unweighted_targets_and_carries():
    rows = []
    for w in range(1, 18):
        # star: 10 targets, 80 rec yards every 2025 game
        rows.append((2025, w, "star", "WR", 10.0, 0.0, 7.0, 80.0, 0.0, 0.0, 0.0,
                     7.0, 80.0, 0.0, 0.0, 0.0))
        rows.append((2025, w, "avg", "WR", 10.0, 0.0, 6.0, 60.0, 0.0, 0.0, 0.0,
                     6.0, 60.0, 0.0, 0.0, 0.0))
    pw = pl.DataFrame(
        rows, orient="row",
        schema=["season", "week", "player_id", "position", "targets", "carries", "receptions",
                "rec_yds", "rush_yds", "rec_td", "rush_td", "rec_exp", "rec_yds_exp",
                "rush_yds_exp", "rec_td_exp", "rush_td_exp"],
    )
    e = efficiency.build(pw, 2026, 1, ECFG)
    star = e.filter(pl.col("player_id") == "star").row(0, named=True)
    assert star["n_targets"] == 170.0
    lam = 170.0 / (170.0 + ECFG["shrink_k_targets"])
    # positional ypt is (80*17+60*17)/(10*17*2) = 7.0; star raw 8.0
    expected = lam * 8.0 + (1 - lam) * 7.0
    assert star["yds_per_target"] == pytest.approx(expected)
