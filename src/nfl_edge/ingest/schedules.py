"""Schedules + free market lines from nflverse. Snapshots lines on every call."""
from __future__ import annotations

import nflreadpy as nfl
import polars as pl

from ..db import insert, upsert

SCHEDULE_COLS = [
    "game_id", "season", "game_type", "week", "gameday", "weekday", "gametime",
    "away_team", "home_team", "away_score", "home_score", "result", "total", "overtime",
    "away_rest", "home_rest", "away_moneyline", "home_moneyline", "spread_line",
    "away_spread_odds", "home_spread_odds", "total_line", "under_odds", "over_odds",
    "div_game", "roof", "surface", "temp", "wind", "away_qb_id", "home_qb_id",
    "away_qb_name", "home_qb_name", "stadium",
]
LINE_COLS = [
    "game_id", "spread_line", "total_line", "away_moneyline", "home_moneyline",
    "away_spread_odds", "home_spread_odds", "over_odds", "under_odds",
]


def fetch(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_schedules(seasons)
    return df.select([c for c in SCHEDULE_COLS if c in df.columns]).with_columns(
        pl.col("gameday").str.to_date(strict=False)
    )


def run(seasons: list[int], week: int | None = None, lines_only: bool = False) -> dict:
    df = fetch(seasons)
    if week is not None:
        df = df.filter(pl.col("week") == week)
    n_sched = 0 if lines_only else upsert(df, "raw.schedules", ["game_id"])
    lines = df.select(LINE_COLS).filter(pl.col("spread_line").is_not_null())
    n_lines = insert(lines, "raw.market_lines")
    return {"schedules": n_sched, "line_snapshots": n_lines}
