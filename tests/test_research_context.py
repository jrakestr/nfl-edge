"""Research Lab DFS context fields: pure functions only, no database."""
from datetime import datetime, timezone

import polars as pl

from nfl_edge.research import context as X

UTC = timezone.utc


def test_bucket_bounds_and_names():
    assert X.bucket_bounds("20-30%") == (20.0, 30.0)
    assert X.bucket_bounds("0-1%") == (0.0, 1.0)
    assert X.bucket_bounds("") is None
    assert X.bucket_bounds("high") is None
    assert X.norm_name("Kenneth Walker III") == X.norm_name("Kenneth Walker")
    assert X.norm_name("D'Andre Swift") == "dandre swift"


def test_ownership_matches_name_team_pos_and_leaves_rest_null():
    players = pl.DataFrame({
        "player_id": ["a", "b", "c"], "full_name": ["Puka Nacua", "Jaylen Warren", "Nobody Here"],
        "team": ["LA", "PIT", "DET"], "position": ["WR", "RB", "WR"],
    })
    own = pl.DataFrame({
        "_name": ["puka nacua", "jaylen warren"], "_team": ["LA", "PIT"], "_pos": ["WR", "RB"],
        "own_pct_est": [25.0, 3.0], "own_pct_low": [20.0, 1.0], "own_pct_high": [30.0, 5.0],
    })
    out = X.ownership_fields(players, own).sort("player_id")
    assert out["own_pct_est"].to_list() == [25.0, 3.0, None]


def test_ownership_absent_is_all_null():
    players = pl.DataFrame({"player_id": ["a"], "full_name": ["A B"], "team": ["X"], "position": ["WR"]})
    own = pl.DataFrame(schema={"_name": pl.Utf8, "_team": pl.Utf8, "_pos": pl.Utf8, "own_pct_est": pl.Float64,
                               "own_pct_low": pl.Float64, "own_pct_high": pl.Float64})
    assert X.ownership_fields(players, own)["own_pct_est"].to_list() == [None]


def test_environment_signs_favorite_negative():
    games = pl.DataFrame({"team": ["DAL", "TB"], "opponent": ["TB", "DAL"], "game_id": ["g", "g"], "home": [1, 0]})
    lines = pl.DataFrame({"game_id": ["g"], "home_fav": [9.5], "total": [50.0]})
    out = X.environment_fields(games, lines, pl.DataFrame(schema={"team": pl.Utf8})).sort("team")
    dal = out.filter(pl.col("team") == "DAL").row(0, named=True)
    tb = out.filter(pl.col("team") == "TB").row(0, named=True)
    assert dal["team_spread"] == -9.5 and tb["team_spread"] == 9.5
    assert dal["team_implied_total"] == 29.75 and tb["team_implied_total"] == 20.25
    assert dal["sim_team_drives"] is None


def test_environment_without_lines_is_null_not_guessed():
    games = pl.DataFrame({"team": ["DAL"], "opponent": ["TB"], "game_id": ["g"], "home": [1]})
    out = X.environment_fields(games, pl.DataFrame(schema={"game_id": pl.Utf8}), pl.DataFrame(schema={"team": pl.Utf8}))
    assert out["team_spread"].to_list() == [None]


def test_opp_vs_position_is_as_of_ranked_and_league_relative():
    rows = []
    for wk, pts in [(1, 30.0), (2, 10.0), (3, 999.0)]:  # week 3 must be ignored for W=3
        rows.append({"season": 2026, "week": wk, "position": "WR", "opponent_team": "AAA", "dk_pts": pts})
        rows.append({"season": 2026, "week": wk, "position": "WR", "opponent_team": "BBB", "dk_pts": 10.0})
    rows.append({"season": 2025, "week": 1, "position": "WR", "opponent_team": "AAA", "dk_pts": 500.0})
    out = X.opp_vs_position(pl.DataFrame(rows), 2026, 3).sort("defense")
    a, b = out.row(0, named=True), out.row(1, named=True)
    assert a["opp_dk_allowed_pos"] == 20.0 and a["opp_games"] == 2.0
    assert a["opp_dk_allowed_pos_rank"] == 1.0 and b["opp_dk_allowed_pos_rank"] == 2.0
    assert round(a["opp_dk_allowed_pos_vs_league"], 6) == round(20 / 15 - 1, 6)


def test_teammates_out_uses_pre_override_shares_and_excludes_self():
    base = pl.DataFrame({
        "team": ["T", "T", "T", "U"], "player_id": ["x", "y", "z", "u"],
        "target_share": [0.3, 0.2, 0.5, 1.0], "carry_share": [0.0, 0.0, 0.0, 1.0],
    })
    ov = pl.DataFrame({"player_id": ["x"], "status": ["out"]})
    out = X.teammates_out(base, ov).sort("player_id")
    assert out["teammates_out_target_share"].to_list() == [0.0, 0.0, 0.3, 0.3]  # u, x (himself), y, z
    # no overrides at all -> no rows: the caller leaves the fields null
    assert X.teammates_out(base, pl.DataFrame(schema={"player_id": pl.Utf8, "status": pl.Utf8})).is_empty()


def test_status_flags_null_without_overrides():
    players = pl.DataFrame({"player_id": ["a", "b"]})
    empty = pl.DataFrame(schema={"player_id": pl.Utf8, "status": pl.Utf8})
    assert X.status_flags(players, empty)["listed_out"].to_list() == [None, None]
    ov = pl.DataFrame({"player_id": ["a"], "status": ["out"]})
    assert X.status_flags(players, ov).sort("player_id")["listed_out"].to_list() == [1.0, 0.0]


def test_draw_quantiles_and_multiples():
    draws = pl.DataFrame({"player_id": ["a"] * 10, "fpts_dk": [float(i) for i in range(1, 11)]})
    sal = pl.DataFrame({"player_id": ["a"], "dk_salary": [2000.0]})
    q = X.draw_quantiles(draws, sal).row(0, named=True)
    assert q["sim_dk_p50"] == 5.5 and q["sim_dk_p90"] == 9.1
    assert q["sim_p_3x"] == 0.5  # DK >= 6: 6..10
    assert q["sim_p_5x"] == 0.1  # DK >= 10
    none = X.draw_quantiles(draws, pl.DataFrame(schema={"player_id": pl.Utf8, "dk_salary": pl.Float64}))
    assert none["sim_p_3x"].to_list() == [None]  # no salary, no multiple


def test_salary_fields_ignore_rows_after_kickoff_and_rank():
    ko = datetime(2026, 10, 18, 17, 0, tzinfo=UTC)
    players = pl.DataFrame({"player_id": ["a", "b", "c"], "position": ["WR", "WR", "WR"], "kickoff": [ko] * 3})
    rows = pl.DataFrame({
        "player_id": ["a", "a", "b", "c"], "dk_salary": [8000.0, 9999.0, 6000.0, 7000.0],
        "ingested_at": [datetime(2026, 10, 16, tzinfo=UTC), datetime(2026, 10, 19, tzinfo=UTC),
                        datetime(2026, 10, 16, tzinfo=UTC), datetime(2026, 10, 20, tzinfo=UTC)],
    })
    out = X.salary_fields(players, rows).sort("player_id")
    assert out["dk_salary"].to_list() == [8000.0, 6000.0, None]
    assert out["salary_pos_rank"].to_list()[:2] == [1.0, 2.0]


def test_dk_variance_needs_two_games_and_is_as_of():
    d = pl.DataFrame({
        "season": [2026] * 4, "week": [1, 2, 3, 1], "player_id": ["a", "a", "a", "b"],
        "dk_pts": [10.0, 20.0, 999.0, 5.0],
    })
    out = X.dk_variance(d, 2026, 3).sort("player_id")
    assert out["dk_pts_sd"].to_list() == [5.0, None]
    assert out["dk_pts_min"].to_list() == [10.0, None]
