"""ffopportunity weekly expected-points data -> raw.ff_opportunity_weekly.

Every `*_exp`, `*_diff`, and opportunity count column is packed into `stats` jsonb.
Rows with a null player_id are team-level residuals and are dropped.
"""
from __future__ import annotations

import nflreadpy as nfl
import polars as pl

from ..db import upsert
from .stats import _pack

ID_COLS = ["season", "week", "player_id", "full_name", "position", "posteam"]


def build(df: pl.DataFrame) -> pl.DataFrame:
    df = df.filter(pl.col("player_id").is_not_null()).with_columns(
        pl.col("season").cast(pl.Int32), pl.col("week").cast(pl.Int32)
    )
    df = df.unique(subset=["season", "week", "player_id"], keep="last")
    return _pack(df, ID_COLS)


def fetch(seasons: list[int]) -> pl.DataFrame:
    return build(nfl.load_ff_opportunity(seasons, "weekly"))


def run(seasons: list[int], week: int | None = None) -> dict:
    df = fetch(seasons)
    if week is not None:
        df = df.filter(pl.col("week") == week)
    return {"ff_opportunity_weekly": upsert(df, "raw.ff_opportunity_weekly", ["season", "week", "player_id"])}
