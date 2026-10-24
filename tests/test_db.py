"""Spec for bulk UPDATE … FROM persist (one statement, N keys)."""
import polars as pl

from nfl_edge import db


def test_update_from_sql_one_statement_n_keys():
    sql = db.update_from_sql(
        "model.fair_props",
        ["run_id", "player_id", "stat", "actual", "over_hit", "graded_at"],
        ["run_id", "player_id", "stat"],
        "_stg_model_fair_props",
    )
    assert sql.lower().startswith("update model.fair_props")
    assert sql.count("update ") == 1
    assert "from _stg_model_fair_props s" in sql
    assert "actual = s.actual" in sql
    assert "over_hit = s.over_hit" in sql
    assert "graded_at = s.graded_at" in sql
    assert "t.run_id = s.run_id" in sql
    assert "t.player_id = s.player_id" in sql
    assert "t.stat = s.stat" in sql
    assert "run_id = s.run_id" not in sql.split("set", 1)[1].split("from", 1)[0]


def test_update_from_empty_is_zero():
    assert db.update_from(pl.DataFrame(), "model.fair_props", ["run_id"]) == 0


def test_migration_0050_defines_fk_and_lookup_indexes():
    from nfl_edge.config import ROOT

    sql = (ROOT / "db" / "migrations" / "0050_fk_and_lookup_indexes.sql").read_text().lower()
    expected = [
        "dfs_lineups_run_slate_idx",
        "edges_market_line_idx",
        "results_market_line_idx",
        "results_close_market_line_idx",
        "verdicts_market_line_idx",
        "usage_claims_llm_call_idx",
        "dk_player_crosswalk_gsis_idx",
        "dk_salaries_player_site_idx",
        "players_espn_idx",
        "market_props_week_player_stat_idx",
        "schedules_season_week_idx",
    ]
    for name in expected:
        assert f"create index if not exists {name}" in sql
    assert "on raw.dk_player_crosswalk (gsis_id)" in sql

