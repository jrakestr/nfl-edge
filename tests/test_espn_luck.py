from datetime import UTC, datetime

import numpy as np
import polars as pl
import pytest
from scipy.stats import norm

from nfl_edge.ingest import espn_luck as L

NOW = datetime(2026, 10, 5, tzinfo=UTC)


def frame(rows):
    """rows: (week, team, opp, proj, actual, final)."""
    return pl.DataFrame(
        [{"season": 2026, "week": w, "espn_team_id": t, "opp_espn_team_id": o, "proj_pts": p,
          "actual_pts": a, "is_final": f} for w, t, o, p, a, f in rows],
        schema={"season": pl.Int64, "week": pl.Int64, "espn_team_id": pl.Int64,
                "opp_espn_team_id": pl.Int64, "proj_pts": pl.Float64, "actual_pts": pl.Float64,
                "is_final": pl.Boolean})


def two_weeks():
    # 4 teams, 2 final weeks; proj error (actual - proj) has spread and a nonzero mean
    return frame([
        (1, 1, 2, 100.0, 110.0, True), (1, 2, 1, 100.0, 90.0, True),
        (1, 3, 4, 120.0, 100.0, True), (1, 4, 3, 110.0, 130.0, True),
        (2, 1, 3, 100.0, 95.0, True), (2, 3, 1, 110.0, 120.0, True),
        (2, 2, 4, 105.0, 80.0, True), (2, 4, 2, 105.0, 115.0, True),
    ])


def test_fewer_than_two_final_weeks_returns_no_rows():
    one_final = frame([(1, 1, 2, 100.0, 110.0, True), (1, 2, 1, 100.0, 90.0, True),
                       (2, 1, 2, 100.0, 50.0, False), (2, 2, 1, 100.0, 60.0, False)])
    assert L.compute_luck(one_final, NOW).is_empty()
    assert L.compute_luck(one_final.clear(), NOW).is_empty()


def test_week_is_final_only_when_every_team_row_is_final():
    rows = [(1, 1, 2, 100.0, 110.0, True), (1, 2, 1, 100.0, 90.0, True),
            (2, 1, 2, 100.0, 95.0, True), (2, 2, 1, 100.0, 105.0, False),
            (3, 1, 2, 100.0, 80.0, True), (3, 2, 1, 100.0, 70.0, True)]
    out = L.compute_luck(frame(rows), NOW)
    assert sorted(out["week"].unique().to_list()) == [1, 3]
    assert out["n_team_weeks"].unique().to_list() == [4]


def test_bias_and_sd_match_polars_fit():
    f = two_weeks()
    out = L.compute_luck(f, NOW)
    err = (f["actual_pts"] - f["proj_pts"]).to_numpy()
    assert out["bias"].unique().to_list() == [pytest.approx(-err.mean())]
    assert out["sd"].unique().to_list() == [pytest.approx(err.std(ddof=1))]
    assert out["n_team_weeks"].unique().to_list() == [8]
    assert out.height == 8


def test_equal_projections_zero_bias_give_even_projected_prob():
    # errors +10 and -10: mean 0 (bias 0); equal projections within each game
    f = frame([(1, 1, 2, 100.0, 110.0, True), (1, 2, 1, 100.0, 90.0, True),
               (2, 1, 2, 100.0, 90.0, True), (2, 2, 1, 100.0, 110.0, True)])
    out = L.compute_luck(f, NOW)
    assert out["bias"].unique().to_list() == [pytest.approx(0.0)]
    assert out["proj_win_prob"].to_list() == [pytest.approx(0.5)] * 4


def test_actual_equal_to_opponent_projection_with_zero_bias_gives_even_earned_prob():
    f = frame([(1, 1, 2, 100.0, 100.0, True), (1, 2, 1, 100.0, 100.0, True),
               (2, 1, 2, 100.0, 120.0, True), (2, 2, 1, 100.0, 80.0, True)])
    out = L.compute_luck(f, NOW).filter(pl.col("week") == 1)
    assert out["bias"].unique().to_list() == [pytest.approx(0.0)]
    assert out["earned_win_prob"].to_list() == [pytest.approx(0.5)] * 2


def test_tie_scores_count_half_a_win():
    f = frame([(1, 1, 2, 100.0, 105.0, True), (1, 2, 1, 100.0, 105.0, True),
               (2, 1, 2, 100.0, 120.0, True), (2, 2, 1, 100.0, 80.0, True)])
    out = L.compute_luck(f, NOW).filter(pl.col("week") == 1)
    assert out["actual_win"].to_list() == [0.5, 0.5]


def test_probabilities_follow_the_stated_formulas():
    f = two_weeks()
    out = L.compute_luck(f, NOW).sort("week", "espn_team_id")
    bias, sd = out["bias"][0], out["sd"][0]
    j = f.join(f.select(pl.col("week"), pl.col("espn_team_id").alias("opp_espn_team_id"),
                        pl.col("proj_pts").alias("opp_proj"), pl.col("actual_pts").alias("opp_act")),
               on=["week", "opp_espn_team_id"]).sort("week", "espn_team_id")
    proj = norm.cdf((j["proj_pts"] - j["opp_proj"]).to_numpy() / (sd * np.sqrt(2)))
    earned = norm.cdf((j["actual_pts"] - (j["opp_proj"] - bias)).to_numpy() / sd)
    assert out["proj_win_prob"].to_list() == pytest.approx(proj.tolist())
    assert out["earned_win_prob"].to_list() == pytest.approx(earned.tolist())


def test_all_play_share_is_teams_beaten_over_others():
    out = L.compute_luck(two_weeks(), NOW).sort("week", "espn_team_id")
    # week 1 scores: t1 110, t2 90, t3 100, t4 130 -> beaten 2, 0, 1, 3 of 3 others
    assert out.filter(pl.col("week") == 1)["allplay_share"].to_list() == pytest.approx(
        [2 / 3, 0.0, 1 / 3, 1.0])


def test_season_luck_sums_to_about_zero_on_a_symmetric_league():
    # each game: one side +d, the other -d, opponents' projections equal -> sums cancel
    f = frame([(1, 1, 2, 100.0, 110.0, True), (1, 2, 1, 100.0, 90.0, True),
               (2, 1, 2, 100.0, 90.0, True), (2, 2, 1, 100.0, 110.0, True)])
    out = L.compute_luck(f, NOW)
    luck = out.group_by("espn_team_id").agg(
        (pl.col("actual_win") - pl.col("earned_win_prob")).sum().alias("luck"))
    assert luck["luck"].sum() == pytest.approx(0.0, abs=1e-9)


def test_zero_spread_in_projection_error_fails_closed():
    f = frame([(1, 1, 2, 100.0, 100.0, True), (1, 2, 1, 100.0, 100.0, True),
               (2, 1, 2, 100.0, 100.0, True), (2, 2, 1, 100.0, 100.0, True)])
    with pytest.raises(ValueError, match="spread"):
        L.compute_luck(f, NOW)


def test_missing_opponent_fails_closed():
    f = frame([(1, 1, 2, 100.0, 110.0, True), (1, 2, 1, 100.0, 90.0, True),
               (2, 1, 9, 100.0, 95.0, True), (2, 2, 1, 100.0, 105.0, True)])
    with pytest.raises(ValueError, match="opponent"):
        L.compute_luck(f, NOW)


def test_output_columns_and_computed_at():
    out = L.compute_luck(two_weeks(), NOW)
    assert out.columns == ["season", "week", "espn_team_id", "proj_win_prob", "earned_win_prob",
                           "actual_win", "allplay_share", "bias", "sd", "n_team_weeks", "computed_at"]
    assert out["computed_at"].unique().to_list() == [NOW]
