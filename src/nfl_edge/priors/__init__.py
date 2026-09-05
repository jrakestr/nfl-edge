"""Priors for (season, week): team, usage, efficiency. All built from rows strictly before week."""
from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from . import common, efficiency, team, usage


@dataclass
class Priors:
    season: int
    week: int
    team: team.TeamPriors
    usage: pl.DataFrame
    efficiency: pl.DataFrame


def build(season: int, week: int, c: dict | None = None) -> Priors:
    c = c or common.cfg()
    pw = usage.load_player_weeks(season, week)
    return Priors(
        season=season,
        week=week,
        team=team.team_priors(season, week, c),
        usage=usage.build(pw, usage.load_roster(season, week), season, week, c),
        efficiency=efficiency.build(pw, season, week, c),
    )
