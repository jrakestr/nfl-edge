import polars as pl
import pytest

from nfl_edge.ingest import stats


def _pbp():
    """One game, home KC vs away BAL. KC has two drives; BAL one drive."""
    cols = [
        "posteam", "fixed_drive", "play_type", "pass", "rush", "sack", "qb_dropback",
        "qb_scramble", "qb_kneel", "qb_spike", "complete_pass", "incomplete_pass", "two_point_attempt",
        "epa", "passing_yards", "rushing_yards", "pass_touchdown", "rush_touchdown",
        "field_goal_result", "field_goal_attempt", "interception", "fumble_lost",
        "score_differential", "game_seconds_remaining",
    ]
    rows = [
        # KC drive 1: completion 10 yds, sack, scramble, rush TD (neutral script)
        ("KC", 1, "pass", 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0.5, 10, 0, 0, 0, None, 0, 0, 0, 0, 3000),
        ("KC", 1, "pass", 1, 0, 1, 1, 0, 0, 0, 0, 0, 0, -1.0, 0, 0, 0, 0, None, 0, 0, 0, 0, 2900),
        ("KC", 1, "run", 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0.2, 0, 8, 0, 0, None, 0, 0, 0, 0, 2800),
        ("KC", 1, "run", 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2.0, 0, 5, 0, 1, None, 0, 0, 0, 0, 2700),
        # extra point / no_play rows must not count as plays
        ("KC", 1, "extra_point", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0, 0, 0, 0, 0, None, 0, 0, 0, 6, 2690),
        ("KC", 2, "no_play", 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.0, 0, 0, 0, 0, None, 0, 0, 0, 7, 2000),
        # KC drive 2: INT while up 7 (neutral), then a made FG
        ("KC", 2, "pass", 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, -2.0, 0, 0, 0, 0, None, 0, 1, 0, 7, 1900),
        ("KC", 2, "field_goal", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, "made", 1, 0, 0, 7, 1800),
        # KC drive 2 ends with a kneel: counts as a play and a carry
        ("KC", 2, "qb_kneel", 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.1, 0, -1, 0, 0, None, 0, 0, 0, 7, 1700),
        # spike: counts as a play and a pass attempt (incomplete), not a dropback
        ("KC", 2, "qb_spike", 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, -0.2, 0, 0, 0, 0, None, 0, 0, 0, 7, 1650),
        # BAL drive: pass TD trailing by 10 inside final 4 minutes (not neutral), then 2-pt try
        ("BAL", 3, "pass", 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 3.0, 40, 0, 1, 0, None, 0, 0, 0, -10, 200),
        ("BAL", 3, "pass", 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0.0, 3, 0, 0, 0, None, 0, 0, 0, -4, 190),
        # kickoff row with null posteam must be ignored
        (None, 3, "kickoff", 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0, 0, 0, 0, 0, None, 0, 0, 0, 0, 180),
    ]
    df = pl.DataFrame(rows, schema=cols, orient="row")
    return df.with_columns(
        pl.lit("2024_01_BAL_KC").alias("game_id"), pl.lit(2024).alias("season"),
        pl.lit(1).alias("week"), pl.lit("KC").alias("home_team"), pl.lit("BAL").alias("away_team"),
        pl.lit(10).alias("home_score"), pl.lit(6).alias("away_score"),
        pl.col("fixed_drive").cast(pl.Float64),
    )


def test_aggregate_pbp_counts():
    agg = stats.aggregate_pbp(_pbp())
    assert agg.height == 2
    kc = agg.filter(pl.col("team") == "KC").row(0, named=True)
    bal = agg.filter(pl.col("team") == "BAL").row(0, named=True)

    assert kc["opponent"] == "BAL" and kc["home"] == 1 and kc["points"] == 10
    assert kc["plays"] == 7              # completion, sack, scramble, rush, INT, kneel, spike
    assert kc["drives"] == 2
    assert kc["pass_att"] == 3           # completion + INT + spike; sack and scramble excluded
    assert kc["rush_att"] == 3           # designed run + scramble + kneel (nflverse `carries`)
    assert kc["sacks"] == 1
    assert kc["dropbacks"] == 4
    assert kc["pass_yds"] == 10 and kc["rush_yds"] == 12
    assert kc["pass_td"] == 0 and kc["rush_td"] == 1 and kc["td"] == 1
    assert kc["fg_made"] == 1 and kc["fg_att"] == 1
    assert kc["fg_per_drive"] == pytest.approx(0.5)
    assert kc["interceptions"] == 1
    assert kc["neutral_pass_rate"] == pytest.approx(4 / 7)   # all 7 plays neutral, 4 dropbacks
    assert kc["plays_per_drive"] == pytest.approx(3.5)
    assert kc["yds_per_att"] == pytest.approx(10 / 3)

    assert bal["home"] == 0 and bal["points"] == 6
    assert bal["plays"] == 1             # 2-pt try excluded
    assert bal["pass_td"] == 1
    assert bal["neutral_pass_rate"] is None  # trailing by 10 in final 4 min: not neutral


def test_aggregate_pbp_missing_column_fails_loudly():
    with pytest.raises(KeyError):
        stats.aggregate_pbp(_pbp().drop("qb_scramble"))


def test_pack_moves_stats_into_struct_and_drops_nan():
    df = pl.DataFrame({"season": [2024], "week": [1], "team": [" KC"], "opponent_team": ["BAL"],
                       "a": [1.0], "b": [float("nan")], "c": ["x"]})
    out = stats._pack(df, stats.TEAM_ID_COLS)
    assert out.columns == stats.TEAM_ID_COLS + ["stats"]
    s = out["stats"][0]
    assert s["a"] == 1.0 and s["b"] is None and s["c"] == "x"
