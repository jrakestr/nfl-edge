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


def team_kickers(roster: pl.DataFrame, overrides: pl.DataFrame | None,
                 depth: pl.DataFrame | None = None) -> dict[str, str]:
    """{team: player_id} for teams with one active kicker (or PK1 on the depth chart when >= 2)."""
    if roster.is_empty():
        return {}
    out_ids: set[str] = set()
    if overrides is not None and not overrides.is_empty():
        out_ids = set(overrides.filter(
            pl.col("status").str.to_lowercase().is_in(list(RULED_OUT))
        )["player_id"].to_list())
    by_team: dict[str, list[str]] = {}
    for row in roster.iter_rows(named=True):
        if row["player_id"] not in out_ids:
            by_team.setdefault(row["team"], []).append(row["player_id"])
    rank_by_id: dict[str, int] = {}
    if depth is not None and not depth.is_empty():
        for row in depth.iter_rows(named=True):
            if row.get("player_id") and row.get("depth_rank") is not None:
                rank_by_id[row["player_id"]] = int(row["depth_rank"])
    out: dict[str, str] = {}
    for team, ids in by_team.items():
        if len(ids) == 1:
            out[team] = ids[0]
        elif len(ids) > 1 and rank_by_id:
            ranked = sorted((rank_by_id.get(i, 99), i) for i in ids)
            if ranked[0][0] < ranked[1][0]:
                out[team] = ranked[0][1]
    return out


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
    from . import depth

    k_depth = depth.load_depth(season, week, positions=("K", "PK"), pos_map={"PK": "K"})
    return {
        "kickers": team_kickers(load_roster_kickers(season, week), overrides, depth=k_depth),
        "fg_mix": fg_distance_mix(load_fg_made(season, week)),
    }
