"""Team priors v1: pace, drives, points per drive, FG rate, pass tendencies.

Built from raw.team_game_agg only. Per team for (season, week):
  drives_mean, plays_per_drive, neutral_pass_rate, off_ppd, def_ppd_allowed, fg_per_drive,
  pass_td_share, int_rate (per pass attempt), sack_rate (per dropback), n_eff
plus a `league` dict with the unshrunk league ratios the simulator uses as its anchor.

The QB channel (qb_pass_factor) is deferred to priors-refine: passing efficiency here is whatever
the team produced over the lookback, starter-agnostic.
"""
from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from ..db import read_sql
from . import common

# metric -> (numerator, denominator) columns of the team-game frame
RATIOS: dict[str, tuple[str, str]] = {
    "drives_mean": ("drives", "games"),
    "plays_per_drive": ("plays", "drives"),
    "neutral_pass_rate": ("neutral_pass_w", "plays"),
    "off_ppd": ("points", "drives"),
    "def_ppd_allowed": ("opp_points", "opp_drives"),
    "fg_per_drive": ("fg_made", "drives"),
    "pass_td_share": ("pass_td", "td"),
    "int_rate": ("interceptions", "pass_att"),
    "sack_rate": ("sacks", "dropbacks"),
}


@dataclass
class TeamPriors:
    teams: pl.DataFrame
    league: dict[str, float]


def load_team_games(season: int, week: int) -> pl.DataFrame:
    return read_sql(
        f"""
        select a.season, a.week, a.team, a.plays, a.drives, a.points, a.fg_made, a.td, a.pass_td,
               a.pass_att, a.dropbacks, a.sacks, a.interceptions,
               coalesce(a.neutral_pass_rate, a.pass_rate) as neutral_pass_rate,
               o.points as opp_points, o.drives as opp_drives
        from raw.team_game_agg a
        join raw.team_game_agg o on o.game_id = a.game_id and o.team = a.opponent
        where {common.history_where(season, week, "a")}
        """
    )


def build(games: pl.DataFrame, season: int, week: int, c: dict) -> TeamPriors:
    """Pure: team-game rows -> shrunk team priors. Testable without a database."""
    g = common.with_weights(games, season, week, c).with_columns(
        pl.lit(1.0).alias("games"),
        (pl.col("neutral_pass_rate") * pl.col("plays")).alias("neutral_pass_w"),
    )
    league = {m: float(g.select(common.league_ratio(n, d)).item()) for m, (n, d) in RATIOS.items()}
    k = float(c["shrink_k_team"])
    per_team = g.group_by("team").agg(
        common.n_eff_weighted().alias("n_eff"),
        *[common.weighted_ratio(n, d).alias(f"_{m}") for m, (n, d) in RATIOS.items()],
    )
    per_team = per_team.with_columns(
        [common.shrink(pl.col(f"_{m}"), pl.col("n_eff"), league[m], k).alias(m) for m in RATIOS]
    ).select(["team", "n_eff", *RATIOS]).sort("team")
    return TeamPriors(per_team, league)


def team_priors(season: int, week: int, c: dict | None = None) -> TeamPriors:
    c = c or common.cfg()
    return build(load_team_games(season, week), season, week, c)
