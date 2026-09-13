"""Lookback report helpers: old window, legacy weights, pts_gap, no hardcoded gsis."""
import inspect

import polars as pl

from nfl_edge.results import lookback_report as lr
from nfl_edge.results.shrink_sweep import CHANGED_QB_TEAMS


def test_old_window_keeps_prior_season_and_drops_s4():
    s, w = 2026, 1
    df = pl.DataFrame({
        "season": [2026, 2025, 2025, 2024, 2023],
        "week": [1, 17, 18, 1, 1],
    })
    kept = df.filter(lr.old_window_mask(s, w))
    assert set(kept.select(["season", "week"]).rows()) == {(2025, 17)}


def test_legacy_weights_are_flat_on_prior_season():
    df = pl.DataFrame({"season": [2025, 2025, 2024], "week": [8, 1, 10]})
    g = lr.legacy_weights(df, 2025, 9)
    prior = g.filter(pl.col("season") == 2024)["w"].to_list()
    assert prior == [0.35]
    cur = g.filter(pl.col("season") == 2025).sort("week")["w"].to_list()
    assert cur[0] < cur[1]


def test_implied_pts_and_board_mean_gap():
    # home implied (47.5 + -3.5) / 2 = 22; away = 25.5
    # mean home 23, away 26 → gaps +1 and +0.5 → mean +0.75
    games = pl.DataFrame({
        "mean_total": [49.0],
        "mean_spread": [-3.0],
        "market_total": [47.5],
        "market_spread": [-3.5],
    })
    assert lr.mean_pts_gap(games) == 0.75


def test_changed_qb_teams_are_the_eight_named_in_status():
    assert CHANGED_QB_TEAMS == ("MIA", "CLE", "NYJ", "CIN", "LV", "ATL", "WAS", "MIN")


def test_lookback_report_resolves_names_not_gsis():
    src = inspect.getsource(lr)
    assert "CeeDee Lamb" in src and "Deshaun Watson" in src
    assert "00-" not in src


def test_incumbent_kish_below_raw_at_fixture_h():
    raw, kish = lr.incumbent_kish_vs_raw(8)
    assert raw == 51
    assert 21.0 < kish < 23.0
    assert kish < raw
