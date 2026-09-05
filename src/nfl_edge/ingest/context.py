"""Depth charts, snap counts, weekly rosters -> raw.* tables, stored as delivered.

Depth charts changed shape in 2025 (daily snapshots keyed on `dt`, no season/week). Both
shapes are mapped onto raw.depth_charts by column rename only; deriving `week` from `dt`
for 2025+ is the `priors-refine` todo. Neither shape has a natural key, so the table is
replaced per season.
"""
from __future__ import annotations

import nflreadpy as nfl
import polars as pl

from ..db import replace_where, upsert
from . import season as season_guard

DEPTH_COLS = ["season", "week", "club_code", "gsis_id", "position", "depth_position",
              "depth_team", "full_name", "dt"]
SNAP_COLS = ["season", "week", "pfr_player_id", "player", "position", "team", "opponent",
             "offense_snaps", "offense_pct", "defense_snaps", "defense_pct", "st_snaps", "st_pct"]
ROSTER_COLS = ["season", "week", "team", "gsis_id", "full_name", "position",
               "depth_chart_position", "status"]


def build_depth_charts(df: pl.DataFrame, season: int) -> pl.DataFrame:
    if "club_code" in df.columns:  # <= 2024 shape
        out = df.select(
            pl.col("season").cast(pl.Int32), pl.col("week").cast(pl.Int32), "club_code", "gsis_id",
            "position", "depth_position", pl.col("depth_team").cast(pl.Int32, strict=False),
            "full_name", pl.lit(None, dtype=pl.Datetime("us", "UTC")).alias("dt"),
        )
    elif "pos_abb" in df.columns:  # 2025+ shape
        out = df.select(
            pl.lit(season, dtype=pl.Int32).alias("season"),
            pl.lit(None, dtype=pl.Int32).alias("week"),
            pl.col("team").alias("club_code"), "gsis_id",
            pl.col("pos_grp").alias("position"), pl.col("pos_abb").alias("depth_position"),
            pl.col("pos_rank").cast(pl.Int32, strict=False).alias("depth_team"),
            pl.col("player_name").alias("full_name"),
            pl.col("dt").str.to_datetime("%Y-%m-%dT%H:%M:%SZ", time_zone="UTC").alias("dt"),
        )
    else:
        raise KeyError(f"unrecognized depth chart columns: {df.columns}")
    return out.select(DEPTH_COLS).filter(pl.col("club_code").is_not_null())


def build_snap_counts(df: pl.DataFrame) -> pl.DataFrame:
    return (
        df.select(SNAP_COLS)
        .with_columns([pl.col(c).cast(pl.Int32, strict=False)
                       for c in ("season", "week", "offense_snaps", "defense_snaps", "st_snaps")])
        .filter(pl.col("pfr_player_id").is_not_null())
        .unique(subset=["season", "week", "pfr_player_id"], keep="last")
    )


def build_rosters(df: pl.DataFrame) -> pl.DataFrame:
    return (
        df.select(ROSTER_COLS)
        .filter(pl.col("gsis_id").is_not_null())
        .unique(subset=["season", "week", "gsis_id"], keep="last")
    )


def run(seasons: list[int], week: int | None = None) -> dict:
    out: dict[str, int] = {"depth_charts": 0, "snap_counts": 0, "rosters_weekly": 0}
    for season in seasons:
        # No natural key -> always replace the whole season, even on a weekly live run.
        dc = build_depth_charts(nfl.load_depth_charts([season]), season)
        out["depth_charts"] += replace_where(dc, "raw.depth_charts", "season", season)
    published, unpublished = season_guard.split(seasons)
    if unpublished:
        out["skipped"] = season_guard.skipped(unpublished, "snap_counts")
    # Rosters: the weekly file for a season that has not kicked off does not exist; the preseason
    # roster (`load_rosters`) has the same columns with week = 1 and stands in until it does.
    parts = []
    if published:
        parts.append(build_rosters(nfl.load_rosters_weekly(published)))
    for s in unpublished:
        parts.append(build_rosters(nfl.load_rosters([s])))
        out["rosters_source"] = f"{s}: preseason load_rosters (rosters_weekly not published)"
    ro = pl.concat(parts) if parts else pl.DataFrame(schema={c: pl.Utf8 for c in ROSTER_COLS})
    sc = build_snap_counts(nfl.load_snap_counts(published)) if published else None
    if week is not None:
        ro = ro.filter(pl.col("week") == week)
        sc = sc.filter(pl.col("week") == week) if sc is not None else None
    if sc is not None:
        out["snap_counts"] = upsert(sc, "raw.snap_counts", ["season", "week", "pfr_player_id"])
    out["rosters_weekly"] = upsert(ro, "raw.rosters_weekly", ["season", "week", "gsis_id"])
    return out
