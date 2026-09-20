"""Spec for the NFLGameSim player MAE table: pure aggregation, no database."""
from __future__ import annotations

import polars as pl
import pytest

from nfl_edge.results.calibration import player_mae_table


def test_mae_by_week_and_pos():
    df = pl.DataFrame({
        "week": [1, 1, 1, 1, 2],
        "pos": ["QB", "QB", "RB", "WR", "QB"],
        "ours": [20.0, 30.0, 10.0, 15.0, 25.0],
        "ngs": [22.0, 26.0, 12.0, 5.0, 25.0],
        "actual": [24.0, 28.0, 12.0, 10.0, 20.0],
    })
    out = player_mae_table(df)
    assert list(out.columns) == ["week", "pos", "n", "ours_mae", "ngs_mae"]
    rows = {(r["week"], r["pos"]): r for r in out.to_dicts()}
    assert rows[(1, "QB")]["n"] == 2
    assert rows[(1, "QB")]["ours_mae"] == pytest.approx(3.0)  # |20-24|, |30-28|
    assert rows[(1, "QB")]["ngs_mae"] == pytest.approx(2.0)  # |22-24|, |26-28|
    assert rows[(1, "RB")]["ours_mae"] == pytest.approx(2.0)
    assert rows[(1, "RB")]["ngs_mae"] == pytest.approx(0.0)
    assert rows[(1, "WR")]["ours_mae"] == pytest.approx(5.0)
    assert rows[(2, "QB")]["n"] == 1


def test_mae_empty_stays_empty():
    df = pl.DataFrame(schema={
        "week": pl.Int64, "pos": pl.Utf8,
        "ours": pl.Float64, "ngs": pl.Float64, "actual": pl.Float64,
    })
    out = player_mae_table(df)
    assert out.is_empty()
    assert list(out.columns) == ["week", "pos", "n", "ours_mae", "ngs_mae"]
