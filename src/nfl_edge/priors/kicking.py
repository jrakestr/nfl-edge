"""Kicking inputs for the sim: who kicks for each team, and how far made field goals travel.

The sim already draws each team's made FGs and XPs. The kicker projection needs only:
  kickers   one active K per team on the latest roster at or before the target week, unless an
            override rules him out (out/doubtful/ir/suspended). Zero or several active kickers:
            no kicker for that team (the sim records a warning; it never guesses).
  fg_mix    league share of made FGs at 0-39 / 40-49 / 50+ yards, from kicker weeks in the as-of
            history window (prior-season week 18 excluded, like every channel).
"""
from __future__ import annotations

import polars as pl

from ..db import read_sql
from . import common

RULED_OUT = ("out", "doubtful", "ir", "suspended")
SHORT = ("fg_made_0_19", "fg_made_20_29", "fg_made_30_39")
MID = ("fg_made_40_49",)
LONG = ("fg_made_50_59", "fg_made_60_")


def fg_distance_mix(made: dict[str, float]) -> list[float] | None:
    """[share 0-39, share 40-49, share 50+] of made FGs; None when nothing was made."""
    def total(keys: tuple[str, ...]) -> float:
        return float(sum(float(made.get(k) or 0.0) for k in keys))

    parts = [total(SHORT), total(MID), total(LONG)]
    n = sum(parts)
    if n <= 0:
        return None
    return [x / n for x in parts]


def team_kickers(roster: pl.DataFrame, overrides: pl.DataFrame | None) -> dict[str, str]:
    """{team: player_id} for teams with exactly one active kicker who is not ruled out."""
    if roster.is_empty():
        return {}
    out_ids: set[str] = set()
    if overrides is not None and not overrides.is_empty():
        out_ids = set(overrides.filter(
            pl.col("status").str.to_lowercase().is_in(list(RULED_OUT))
        )["player_id"].to_list())
    by_team: dict[str, list[str]] = {}
    for row in roster.iter_rows(named=True):
        by_team.setdefault(row["team"], []).append(row["player_id"])
    return {team: ids[0] for team, ids in by_team.items() if len(ids) == 1 and ids[0] not in out_ids}


def load_roster_kickers(season: int, week: int) -> pl.DataFrame:
    """Active K on each team's latest roster at or before the target week (published pre-game)."""
    return read_sql(
        f"""
        with latest as (
          select team, max(week) as week from raw.rosters_weekly
          where season = {season} and week <= {week} group by team
        )
        select r.team, r.gsis_id as player_id
        from raw.rosters_weekly r join latest l on l.team = r.team and l.week = r.week
        where r.season = {season} and r.status = 'ACT' and r.position = 'K'
          and r.gsis_id is not null
        """
    ).cast({"team": pl.Utf8, "player_id": pl.Utf8})


def load_fg_made(season: int, week: int) -> dict[str, float]:
    """Made FGs by distance over the as-of history window (kicker rows only)."""
    hist = common.history_where(season, week)
    keys = SHORT + MID + LONG
    cols = ", ".join(f"coalesce(sum((stats->>'{k}')::float), 0) as {k}" for k in keys)
    df = read_sql(f"select {cols} from raw.player_stats_weekly where {hist} and stats ? 'fg_made_40_49'")
    return {} if df.is_empty() else df.to_dicts()[0]


def build(season: int, week: int, overrides: pl.DataFrame | None = None) -> dict:
    return {
        "kickers": team_kickers(load_roster_kickers(season, week), overrides),
        "fg_mix": fg_distance_mix(load_fg_made(season, week)),
    }
