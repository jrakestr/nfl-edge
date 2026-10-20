"""Priors for (season, week): team, usage, efficiency, qb. All built from rows strictly before week,
plus pre-kickoff context for the week itself (roster status, depth chart, announced starters,
manual overrides)."""
from __future__ import annotations

from dataclasses import dataclass, field

import polars as pl

from . import calibration, common, depth, efficiency, elo, kicking, qb, role, team, usage


@dataclass
class Priors:
    season: int
    week: int
    team: team.TeamPriors
    usage: pl.DataFrame
    efficiency: pl.DataFrame
    qb: pl.DataFrame = field(default_factory=pl.DataFrame)
    elo: dict[str, float] = field(default_factory=dict)
    kicking: dict = field(default_factory=dict)   # {"kickers": {team: player_id}, "fg_mix": [..]}
    target_rate: float = 1.0                      # share of pass attempts thrown to a receiver
    calibration: dict = field(default_factory=dict)  # realized-outcome factors applied (1.0 = none)


def build(season: int, week: int, c: dict | None = None) -> Priors:
    c = c or common.cfg()
    pw = usage.load_player_weeks(season, week)
    starters = qb.load_starters(season, week)
    dc = depth.load_depth(season, week)
    ov = usage.load_overrides(season, week)
    u = usage.build(pw, usage.load_roster(season, week), season, week, c, starters=starters, depth=dc,
                    overrides=ov)
    fallback = u.filter(pl.col("is_qb1")).select(["team", "player_id"])
    q = qb.build(qb.load_qb_weeks(season, week), starters, fallback, season, week, c,
                 overrides=ov)
    tp = team.team_priors(season, week, c)
    factors: dict[str, float] = {}
    if c.get("realized_calibration", False):
        factors = calibration.fit(calibration.load_cells(season, week),
                                  float(c.get("calibration_k_team_games", 32)))
        for ch in c.get("calibration_off", []):
            factors[ch] = 1.0
        shares = role.recent_offense_share(role.load_recent_snaps(season, week),
                                           int(c.get("role_games", 3)))
        u = calibration.apply_usage(u, factors, shares, role.depth_starters(dc.to_dicts()),
                                    float(c.get("role_min_offense_pct", 0.10)))
        tp = team.TeamPriors(calibration.apply_teams(tp.teams, factors), tp.league)
    target_rate = calibration.load_target_rate(season, week) if c.get("untargeted_attempts") else 1.0
    return Priors(
        season=season,
        week=week,
        team=tp,
        usage=u,
        efficiency=efficiency.build(pw, season, week, c),
        qb=q,
        elo=elo.load_ratings(season, week),
        kicking=kicking.build(season, week, ov),
        target_rate=target_rate,
        calibration=factors,
    )
