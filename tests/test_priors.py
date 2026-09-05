"""Priors v1: shrinkage moves toward the league mean with fewer games; leakage filter; weights.

Uses the pure builders (team.build, common.*) on synthetic team-game rows; no database.
The overrides test lands with priors-refine.
"""
import math

import polars as pl
import pytest

from nfl_edge.priors import common, team

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
    assert where == "(a.season = 2024 or (a.season = 2025 and a.week < 9))"
    # apply the same rule in polars to a frame with target/future rows and confirm they drop
    df = pl.DataFrame({"season": [2024, 2025, 2025, 2025, 2026], "week": [17, 8, 9, 10, 1]})
    kept = df.filter((pl.col("season") == 2024) | ((pl.col("season") == 2025) & (pl.col("week") < 9)))
    assert kept["week"].to_list() == [17, 8]


def test_league_anchor_is_unshrunk_pooled_ratio():
    g = _frame(8)
    p = team.build(g, 2025, 9, CFG)
    assert p.league["off_ppd"] == pytest.approx((24 * 16 + 40 * 8) / (11 * 24))
