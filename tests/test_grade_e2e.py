"""End to end grading on local 2025 week-10 runs.

Marked `db`; excluded from the default run. Skips unless DATABASE_URL connects, migration 0005
is applied, and at least one 2025 wk10 run has parquet under data/draws. Writes model.results
(upsert) and output/grading_2025.md.
"""
from __future__ import annotations

import json
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.config import ROOT

pytestmark = pytest.mark.db


@pytest.fixture(scope="module")
def report():
    try:
        from nfl_edge.db import read_sql
        cols = read_sql(
            "select column_name from information_schema.columns "
            "where table_schema = 'model' and table_name = 'results'"
        )
    except RuntimeError as e:
        pytest.skip(str(e))
    if cols.is_empty() or "market_line_id" not in cols["column_name"].to_list():
        pytest.skip("migration 0005 not applied")
    from nfl_edge.results.grade import run
    return run(2025, 10)


def _parquet_run_ids():
    from nfl_edge.db import read_sql
    from nfl_edge.results.grade import _parquet_ok
    df = read_sql(
        "select run_id::text from model.sim_runs where season = 2025 and week = 10"
    )
    return [r for r in df["run_id"].to_list() if _parquet_ok(r)]


def test_every_parquet_run_has_84_results_rows(report):
    from nfl_edge.db import read_sql
    ids = _parquet_run_ids()
    assert ids and report.n_rows == 84 * len(ids)
    res = read_sql(
        "select run_id::text, count(*) n from model.results "
        "where run_id = any(%s::uuid[]) group by 1",
        (ids,),
    )
    assert set(res["run_id"].to_list()) == set(ids)
    assert (res["n"] == 84).all()


def test_one_win_or_two_pushes_per_market(report):
    from nfl_edge.db import read_sql
    ids = _parquet_run_ids()
    res = read_sql(
        """
        select run_id::text, market_line_id, market_type,
               sum(case when outcome = 1 then 1 else 0 end) as wins,
               sum(case when outcome is null then 1 else 0 end) as pushes
        from model.results where run_id = any(%s::uuid[])
        group by 1, 2, 3
        """,
        (ids,),
    )
    assert res.height
    assert ((res["wins"] == 1) | (res["pushes"] == 2)).all()


def test_backfilled_close_is_schedules_and_clv_points_zero(report):
    from nfl_edge.db import read_sql
    ids = _parquet_run_ids()
    res = read_sql(
        """
        select close_source, market_type, clv_points::float8 as clv_points
        from model.results where run_id = any(%s::uuid[])
        """,
        (ids,),
    )
    assert (res["close_source"] == "schedules").all()
    ml = res.filter(pl.col("market_type") == "moneyline")
    lines = res.filter(pl.col("market_type") != "moneyline")
    assert ml["clv_points"].null_count() == ml.height
    assert (lines["clv_points"] == 0).all()


def test_picks_one_row_per_run_and_verdict_picks_match(report):
    from nfl_edge.db import read_sql
    ids = _parquet_run_ids()
    overall = report.picks.filter(pl.col("slice") == "all")
    assert overall.height == len(ids)
    res = read_sql(
        """
        select sum(case when verdict_pick then 1 else 0 end)::int as picks
        from model.results where run_id = any(%s::uuid[])
        """,
        (ids,),
    )
    verd = read_sql(
        """
        select payload from model.verdicts_latest where run_id = any(%s::uuid[])
        """,
        (ids,),
    )
    n_chip = 0
    for p in verd["payload"].to_list():
        if isinstance(p, str):
            p = json.loads(p)
        chips = (p or {}).get("chips") or {}
        if (chips.get("side") or {}).get("market_type") and (chips.get("total") or {}).get("market_type"):
            n_chip += 1
    assert int(res["picks"][0] or 0) == 2 * n_chip


def test_season_report_file_exists(report):
    from nfl_edge.results.calibration import results_report
    path = results_report(2025)
    assert path == Path(ROOT / "output" / "grading_2025.md")
    assert path.is_file() and path.stat().st_size > 0
    assert "structurally zero" in path.read_text()
