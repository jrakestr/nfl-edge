"""Load a manual injury/usage CSV into raw.player_overrides."""
from __future__ import annotations

from pathlib import Path

import polars as pl

from ..db import read_sql, upsert
from . import names as N


def load_catalog() -> pl.DataFrame:
    return read_sql(
        "select gsis_id, display_name, merge_name, latest_team, position from raw.players"
    )


def run(season: int, week: int, path: Path) -> dict:
    rows = N.parse_overrides_csv(Path(path))
    matched, unmatched = N.apply_overrides(rows, load_catalog(), N.load_aliases(), N.load_teams())
    written = 0
    if not matched.is_empty():
        frame = matched.with_columns(
            pl.lit(season).alias("season"),
            pl.lit(week).alias("week"),
        ).select(["season", "week", "player_id", "status", "usage_multiplier", "note"])
        written = upsert(frame, "raw.player_overrides", ["season", "week", "player_id"])
    return {
        "path": str(path),
        "season": season,
        "week": week,
        "rows": len(rows),
        "written": written,
        "matched": matched["player_id"].to_list() if not matched.is_empty() else [],
        "unmatched": unmatched,
    }
