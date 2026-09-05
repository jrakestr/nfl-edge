"""Depth charts normalized to (team, player_id, position, depth_rank) as of a pre-kickoff snapshot.

Two raw shapes live in raw.depth_charts:
  <= 2024: one row per (season, week, club_code, gsis_id, depth_position) with `week` set.
  2025+:   daily snapshots with `week` null and `dt`; depth_position is already QB/RB/WR/TE/...

For target (season, week) the loader takes the latest weekly chart with week <= W (old shape) or the
latest daily snapshot dated on/before the first gameday of week W (new shape). Both are information a
live run has before kickoff; neither encodes outcomes.
"""
from __future__ import annotations

import polars as pl

from ..db import read_sql

SKILL_DEPTH = ("QB", "RB", "WR", "TE", "FB", "HB")
POS_MAP = {"FB": "RB", "HB": "RB"}


def _finish(df: pl.DataFrame) -> pl.DataFrame:
    if df.is_empty():
        return pl.DataFrame(schema={"team": pl.Utf8, "player_id": pl.Utf8, "position": pl.Utf8,
                                    "depth_rank": pl.Int32})
    return (
        df.with_columns(pl.col("position").replace(POS_MAP), pl.col("depth_rank").cast(pl.Int32))
        .filter(pl.col("depth_rank").is_not_null())
        .sort(["team", "player_id", "depth_rank"])
        .unique(subset=["team", "player_id"], keep="first")
        .select(["team", "player_id", "position", "depth_rank"])
    )


def load_depth(season: int, week: int) -> pl.DataFrame:
    weekly = read_sql(
        """
        with latest as (
          select club_code, max(week) as week from raw.depth_charts
          where season = %s and week is not null and week <= %s group by club_code
        )
        select d.club_code as team, d.gsis_id as player_id, d.depth_position as position,
               d.depth_team as depth_rank
        from raw.depth_charts d join latest l on l.club_code = d.club_code and l.week = d.week
        where d.season = %s and d.gsis_id is not null and d.depth_position = any(%s)
        """,
        (season, week, season, list(SKILL_DEPTH)),
    )
    if not weekly.is_empty():
        return _finish(weekly)
    daily = read_sql(
        """
        with cutoff as (
          select min(gameday) as gameday from raw.schedules where season = %s and week = %s
        ), snap as (
          select max(dt) as dt from raw.depth_charts d, cutoff
          where d.season = %s and d.week is null and d.dt::date <= cutoff.gameday
        )
        select d.club_code as team, d.gsis_id as player_id, d.depth_position as position,
               d.depth_team as depth_rank
        from raw.depth_charts d join snap on snap.dt = d.dt
        where d.season = %s and d.gsis_id is not null and d.depth_position = any(%s)
        """,
        (season, week, season, season, list(SKILL_DEPTH)),
    )
    return _finish(daily)
