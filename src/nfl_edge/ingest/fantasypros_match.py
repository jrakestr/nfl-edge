"""Map FantasyPros players to raw.players.gsis_id. Pure.

Order: FantasyPros id (raw.players.fantasypros_id) -> names.match_one (alias, name + team +
position, DST). Ambiguous and unknown rows are reported, never guessed. FantasyPros team codes
(JAC, LAR) go through the existing names.TEAM_ALIASES; no new aliases are added here.
"""
from __future__ import annotations

import polars as pl

from . import names as N


def build_fp_map(players: pl.DataFrame) -> dict[str, str]:
    """fantasypros_id -> gsis_id from raw.players. An id that maps to several players is dropped
    so those rows fall through to name matching instead of picking one."""
    df = players.filter(pl.col("fantasypros_id").is_not_null() & pl.col("gsis_id").is_not_null())
    df = df.with_columns(pl.col("fantasypros_id").cast(pl.Utf8))
    counts = df.group_by("fantasypros_id").agg(pl.col("gsis_id").n_unique().alias("n"))
    ok = counts.filter(pl.col("n") == 1)["fantasypros_id"].to_list()
    keep = df.filter(pl.col("fantasypros_id").is_in(ok)).unique(subset=["fantasypros_id"])
    return dict(zip(keep["fantasypros_id"].to_list(), keep["gsis_id"].to_list(), strict=True))


def match_player(fp_id: str | int | None, name: str, team: str | None, position: str | None,
                 fp_map: dict[str, str], catalog: pl.DataFrame, aliases: dict[str, str],
                 teams: dict) -> N.MatchResult:
    if fp_id is not None and str(fp_id) in fp_map:
        return N.MatchResult(fp_map[str(fp_id)], None)
    return N.match_one(
        {"player": name, "team": team, "position": position}, catalog, aliases, teams,
    )


def load_fp_map() -> dict[str, str]:
    from ..db import read_sql

    return build_fp_map(read_sql("select fantasypros_id, gsis_id from raw.players"))
