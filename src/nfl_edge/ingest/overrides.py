"""Load a manual injury/usage CSV into raw.player_overrides."""
from __future__ import annotations

from pathlib import Path

import polars as pl

from ..db import _write, read_sql
from . import names as N

OVERRIDE_CONFLICT = """
on conflict (season, week, player_id) do update set
  status = excluded.status,
  usage_multiplier = excluded.usage_multiplier,
  note = excluded.note,
  updated_at = case
    when raw.player_overrides.status is distinct from excluded.status
    then now() else raw.player_overrides.updated_at end
"""


def should_touch_override(old_status: str | None, new_status: str | None) -> bool:
    """True only when the stored status changes. Same O/D re-ingest keeps updated_at."""
    old = None if old_status is None else str(old_status).strip().lower()
    new = None if new_status is None else str(new_status).strip().lower()
    return old != new


def write_overrides(df: pl.DataFrame) -> int:
    """Upsert overrides; bump updated_at only when status changes."""
    cols = ["season", "week", "player_id", "status", "usage_multiplier", "note"]
    return _write(df.select(cols), "raw.player_overrides", OVERRIDE_CONFLICT)


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
        written = write_overrides(frame)
    return {
        "path": str(path),
        "season": season,
        "week": week,
        "rows": len(rows),
        "written": written,
        "matched": matched["player_id"].to_list() if not matched.is_empty() else [],
        "unmatched": unmatched,
    }
