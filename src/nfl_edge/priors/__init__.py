"""Priors for (season, week): team, usage, efficiency, qb. All built from rows strictly before week,
plus pre-kickoff context for the week itself (roster status, depth chart, announced starters,
manual overrides)."""
from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

from . import common, depth, efficiency, qb, team, usage


@dataclass
class Priors:
    season: int
    week: int
    team: team.TeamPriors
    usage: pl.DataFrame
    efficiency: pl.DataFrame
    qb: pl.DataFrame = field(default_factory=pl.DataFrame)


def build(season: int, week: int, c: dict | None = None) -> Priors:
    c = c or common.cfg()
    pw = usage.load_player_weeks(season, week)
    starters = qb.load_starters(season, week)
    dc = depth.load_depth(season, week)
    u = usage.build(pw, usage.load_roster(season, week), season, week, c, starters=starters, depth=dc,
                    overrides=usage.load_overrides(season, week))
    fallback = u.filter(pl.col("is_qb1")).select(["team", "player_id"])
    q = qb.build(qb.load_qb_weeks(season, week), starters, fallback, season, week, c)
    return Priors(
        season=season,
        week=week,
        team=team.team_priors(season, week, c),
        usage=u,
        efficiency=efficiency.build(pw, season, week, c),
        qb=q,
    )
