"""Player ID crosswalk: nflverse players + ffverse playerids -> raw.players.

Every cross-source join (gsis <-> pfr <-> FantasyPros) goes through raw.players.
Keyed on gsis_id; players with no gsis_id (never on an NFL roster) are dropped.
"""
from __future__ import annotations

import nflreadpy as nfl
import polars as pl

from ..db import upsert

PLAYER_COLS = [
    "gsis_id", "display_name", "first_name", "last_name", "position", "position_group",
    "latest_team", "status", "birth_date", "rookie_season", "last_season",
    "pfr_id", "espn_id", "nfl_id", "esb_id", "pff_id",
]
FF_COLS = [
    "gsis_id", "merge_name", "sportradar_id", "fantasypros_id", "fantasy_data_id",
    "sleeper_id", "yahoo_id", "pfr_id", "espn_id",
]
OUT_COLS = [
    "gsis_id", "display_name", "merge_name", "first_name", "last_name", "position",
    "position_group", "latest_team", "status", "birth_date", "rookie_season", "last_season",
    "pfr_id", "espn_id", "nfl_id", "esb_id", "pff_id", "sportradar_id", "fantasypros_id",
    "fantasy_data_id", "sleeper_id", "yahoo_id",
]


def _str(df: pl.DataFrame, cols: list[str]) -> pl.DataFrame:
    """Cast id columns to Utf8; upstream mixes int and str across files."""
    return df.with_columns([pl.col(c).cast(pl.Utf8) for c in cols if c in df.columns])


def build(players: pl.DataFrame, ff_ids: pl.DataFrame) -> pl.DataFrame:
    """Merge nflverse players with ffverse ids. Pure function so it can be tested offline."""
    p = _str(players.select([c for c in PLAYER_COLS if c in players.columns]),
             ["pfr_id", "espn_id", "nfl_id", "esb_id", "pff_id"])
    p = p.filter(pl.col("gsis_id").is_not_null())
    if "birth_date" in p.columns and p["birth_date"].dtype == pl.Utf8:
        p = p.with_columns(pl.col("birth_date").str.to_date(strict=False))

    f = _str(ff_ids.select([c for c in FF_COLS if c in ff_ids.columns]),
             ["sportradar_id", "fantasypros_id", "fantasy_data_id", "sleeper_id", "yahoo_id",
              "pfr_id", "espn_id"])
    f = f.filter(pl.col("gsis_id").is_not_null()).unique(subset=["gsis_id"], keep="last")
    f = f.rename({"pfr_id": "pfr_id_ff", "espn_id": "espn_id_ff"})

    out = p.join(f, on="gsis_id", how="left")
    # nflverse ids win; fall back to ffverse where nflverse is null.
    out = out.with_columns(
        pl.coalesce(["pfr_id", "pfr_id_ff"]).alias("pfr_id"),
        pl.coalesce(["espn_id", "espn_id_ff"]).alias("espn_id"),
    ).drop(["pfr_id_ff", "espn_id_ff"])
    for c in OUT_COLS:
        if c not in out.columns:
            out = out.with_columns(pl.lit(None, dtype=pl.Utf8).alias(c))
    return out.select(OUT_COLS).unique(subset=["gsis_id"], keep="last")


def fetch() -> pl.DataFrame:
    return build(nfl.load_players(), nfl.load_ff_playerids())


def unresolved_snap_pfr() -> pl.DataFrame:
    """Per season: snap_count pfr ids that do not resolve to a gsis_id through raw.players."""
    from ..db import read_sql

    return read_sql(
        """
        select s.season,
               count(distinct s.pfr_player_id) as pfr_ids,
               count(distinct s.pfr_player_id) filter (where p.gsis_id is null) as unresolved,
               round(100.0 * count(distinct s.pfr_player_id) filter (where p.gsis_id is null)
                     / greatest(count(distinct s.pfr_player_id), 1), 2) as unresolved_pct,
               round(100.0 * sum(s.offense_snaps) filter (where p.gsis_id is null)
                     / greatest(sum(s.offense_snaps), 1), 2) as unresolved_off_snap_pct
        from raw.snap_counts s
        left join raw.players p on p.pfr_id = s.pfr_player_id
        group by s.season order by s.season
        """
    )


def run(seasons: list[int] | None = None, week: int | None = None) -> dict:
    df = fetch()
    n = upsert(df, "raw.players", ["gsis_id"])
    return {
        "players": n,
        "with_pfr_id": int(df["pfr_id"].is_not_null().sum()),
        "with_fantasypros_id": int(df["fantasypros_id"].is_not_null().sum()),
    }
