"""QB channel: who starts, how efficient they are relative to what the team produced, attempt share.

Per team for (season, week):
  qb_id           expected starter: raw.schedules.{home,away}_qb_id for week W (announced pre-kickoff;
                  the only schedules columns priors read), else depth-chart QB1, else most attempts.
  qb_pass_factor  shrunk starter yards/attempt / shrunk team lookback yards/attempt, clipped.
                  1.0 when the starter is the QB who produced the lookback; < 1 for a backup.
                  Applied to team off_ppd (** elasticity) and to receiver yardage efficiency, which
                  makes receiver rates QB-neutral: they were measured under the team's lookback QB play.
  qb_att_share    starter share of team pass attempts in weeks they played, shrunk toward the prior.
Team-level passing rows come from player_stats_weekly (QB rows) and never touch game outcomes.
"""
from __future__ import annotations

import polars as pl

from ..db import read_sql
from . import common


def load_starters(season: int, week: int) -> pl.DataFrame:
    """Expected starter per team for the target week (pre-kickoff information)."""
    return read_sql(
        """
        select home_team as team, home_qb_id as qb_id from raw.schedules
        where season = %s and week = %s and home_qb_id is not null
        union all
        select away_team as team, away_qb_id as qb_id from raw.schedules
        where season = %s and week = %s and away_qb_id is not null
        """,
        (season, week, season, week),
    )


def load_qb_weeks(season: int, week: int) -> pl.DataFrame:
    """QB player-weeks with the team's total attempts/yards that week (history only)."""
    hist = common.history_where(season, week)
    return read_sql(
        f"""
        with qb as (
          select season, week, player_id, team,
                 (stats->>'attempts')::float as attempts, (stats->>'passing_yards')::float as pass_yds
          from raw.player_stats_weekly
          where {hist} and (stats->>'attempts')::float > 0
        ), tt as (
          select season, week, team, sum(attempts) as team_attempts, sum(pass_yds) as team_pass_yds
          from qb group by 1, 2, 3
        )
        select qb.*, tt.team_attempts, tt.team_pass_yds
        from qb join tt on tt.season = qb.season and tt.week = qb.week and tt.team = qb.team
        """
    )


def build(qb_weeks: pl.DataFrame, starters: pl.DataFrame, fallback_qb1: pl.DataFrame,
          season: int, week: int, c: dict) -> pl.DataFrame:
    """Pure. fallback_qb1: (team, player_id) used when schedules has no starter for the team."""
    g = common.with_weights(qb_weeks, season, week, c)
    league_ypa = float(g.select(common.league_ratio("pass_yds", "attempts")).item()) if g.height else 7.0
    lo, hi = c.get("qb_factor_clip", [0.8, 1.2])

    team_weeks = g.unique(subset=["season", "week", "team"])
    team = team_weeks.group_by("team").agg(
        pl.col("w").sum().alias("n_eff"),
        common.weighted_ratio("team_pass_yds", "team_attempts").alias("_ypa"),
    ).with_columns(
        common.shrink(pl.col("_ypa"), pl.col("n_eff"), league_ypa, float(c["shrink_k_team"])).alias("team_ypa")
    ).select(["team", "team_ypa"])

    per_qb = g.with_columns((pl.col("attempts") / pl.col("team_attempts")).alias("_share")).group_by("player_id").agg(
        (pl.col("w") * pl.col("attempts")).sum().alias("n_att"),
        pl.col("w").filter(pl.col("attempts") >= 10).sum().alias("n_starts"),
        common.weighted_ratio("pass_yds", "attempts").alias("_ypa"),
        ((pl.col("w") * pl.col("_share")).filter(pl.col("attempts") >= 10).sum()
         / pl.col("w").filter(pl.col("attempts") >= 10).sum()).alias("_share"),
    ).with_columns(
        common.shrink(pl.col("_ypa"), pl.col("n_att"), league_ypa, float(c["shrink_k_qb_att"])).alias("qb_ypa"),
        common.shrink(pl.col("_share"), pl.col("n_starts"), float(c["qb_att_share_prior"]),
                      float(c["shrink_k_qb_share"])).alias("qb_att_share"),
    ).select(["player_id", "qb_ypa", "qb_att_share"])

    teams = pl.concat([starters.select(["team"]), fallback_qb1.select(["team"])]).unique()
    out = (
        teams.join(starters, on="team", how="left")
        .join(fallback_qb1.rename({"player_id": "fallback"}), on="team", how="left")
        .with_columns(pl.coalesce(["qb_id", "fallback"]).alias("qb_id"))
        .drop("fallback")
        .filter(pl.col("qb_id").is_not_null())
        .join(per_qb, left_on="qb_id", right_on="player_id", how="left")
        .join(team, on="team", how="left")
        .with_columns(
            pl.col("qb_ypa").fill_null(league_ypa),
            pl.col("team_ypa").fill_null(league_ypa),
            pl.col("qb_att_share").fill_null(float(c["qb_att_share_prior"])),
        )
        .with_columns((pl.col("qb_ypa") / pl.col("team_ypa")).clip(lo, hi).alias("qb_pass_factor"))
        .select(["team", "qb_id", "qb_ypa", "team_ypa", "qb_pass_factor", "qb_att_share"])
        .sort("team")
    )
    return out.with_columns(pl.lit(season).alias("season"), pl.lit(week).alias("week"))
