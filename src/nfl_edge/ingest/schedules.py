"""Schedules + free market lines from nflverse.

Every call snapshots the current lines into raw.market_lines; the unique index from migration
0003 makes an unchanged snapshot a no-op, so historical backfills end with one row per game
and the live season appends only when a value moves.
"""
from __future__ import annotations

import nflreadpy as nfl
import polars as pl

from ..db import insert_ignore, read_sql, upsert

SCHEDULE_COLS = [
    "game_id", "season", "game_type", "week", "gameday", "weekday", "gametime",
    "away_team", "home_team", "away_score", "home_score", "result", "total", "overtime",
    "away_rest", "home_rest", "away_moneyline", "home_moneyline", "spread_line",
    "away_spread_odds", "home_spread_odds", "total_line", "under_odds", "over_odds",
    "div_game", "roof", "surface", "temp", "wind", "away_qb_id", "home_qb_id",
    "away_qb_name", "home_qb_name", "stadium", "location",
]
LINE_COLS = [
    "game_id", "spread_line", "total_line", "away_moneyline", "home_moneyline",
    "away_spread_odds", "home_spread_odds", "over_odds", "under_odds",
]
RESULT_COLS = ["away_score", "home_score", "result", "total", "overtime"]
# Required on insert so upsert's INSERT … ON CONFLICT is valid; taken from the stored row.
IDENTITY_COLS = ["season", "week", "away_team", "home_team"]
FROZEN_COLS = {
    "game_id", "season", "game_type", "week", "gameday", "weekday", "gametime",
    "away_team", "home_team", "location", "stadium",
    "spread_line", "total_line", "away_moneyline", "home_moneyline",
    "away_spread_odds", "home_spread_odds", "over_odds", "under_odds",
}


def schedule_writes(incoming: pl.DataFrame, existing: pl.DataFrame, *,
                    lines_only: bool) -> tuple[pl.DataFrame, pl.DataFrame]:
    """Split incoming rows into inserts and result/mutable updates. Pure."""
    empty = incoming.clear()
    if incoming.is_empty():
        return empty, empty
    have = set() if existing.is_empty() else set(existing["game_id"].to_list())
    to_insert = incoming.filter(~pl.col("game_id").is_in(list(have))) if have else incoming
    old = incoming.filter(pl.col("game_id").is_in(list(have))) if have else empty
    if old.is_empty():
        return to_insert, empty
    update_cols = [c for c in RESULT_COLS if c in incoming.columns] if lines_only else [
        c for c in incoming.columns if c not in FROZEN_COLS
    ]
    if not update_cols:
        return to_insert, empty
    prev = {r["game_id"]: r for r in existing.iter_rows(named=True)}
    changed_ids = [
        r["game_id"] for r in old.iter_rows(named=True)
        if any(r.get(c) != prev.get(r["game_id"], {}).get(c) for c in update_cols)
    ]
    to_update = old.filter(pl.col("game_id").is_in(changed_ids)).select(["game_id"] + update_cols)
    return to_insert, to_update


def pad_update_for_upsert(to_update: pl.DataFrame, existing: pl.DataFrame) -> pl.DataFrame:
    """Carry stored NOT NULL identity so upsert can INSERT-then-conflict without nulling keys."""
    need = [c for c in IDENTITY_COLS if c not in to_update.columns]
    if to_update.is_empty() or not need or existing.is_empty():
        return to_update
    return to_update.join(existing.select(["game_id", *need]), on="game_id", how="left")


def fetch(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_schedules(seasons)
    if "location" not in df.columns:
        raise KeyError(f"load_schedules is missing expected column 'location'; columns={list(df.columns)}")
    return df.select([c for c in SCHEDULE_COLS if c in df.columns]).with_columns(
        pl.col("gameday").str.to_date(strict=False)
    )


def run(seasons: list[int], week: int | None = None, lines_only: bool = False,
        snapshot_lines: bool = True) -> dict:
    df = fetch(seasons)
    if week is not None:
        df = df.filter(pl.col("week") == week)
    ids = df["game_id"].to_list()
    existing = read_sql(
        "select * from raw.schedules where game_id = any(%s)", (ids,),
    ) if ids else pl.DataFrame()
    to_insert, to_update = schedule_writes(df, existing, lines_only=lines_only)
    n_ins = upsert(to_insert, "raw.schedules", ["game_id"]) if not to_insert.is_empty() else 0
    to_update = pad_update_for_upsert(to_update, existing)
    n_upd = upsert(to_update, "raw.schedules", ["game_id"]) if not to_update.is_empty() else 0
    n_lines = 0
    if snapshot_lines:
        lines = df.select(LINE_COLS).filter(pl.col("spread_line").is_not_null())
        n_lines = insert_ignore(lines, "raw.market_lines")
    return {"inserted": n_ins, "updated": n_upd, "line_snapshots": n_lines}
