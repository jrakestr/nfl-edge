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
