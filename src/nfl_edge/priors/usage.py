"""Usage priors v1: per active player, share of team targets / carries / red-zone chances.

Sources (all through the (season, week) leakage filter):
  raw.player_stats_weekly   targets, carries, attempts (and yards/TDs for efficiency.py)
  raw.ff_opportunity_weekly rec_touchdown_exp / rush_touchdown_exp as red-zone proxies
  raw.snap_counts           offense_pct, joined gsis<->pfr through raw.players
  raw.rosters_weekly        active roster at the target week (published pre-game; not leakage)

Shares are weighted ratios of sums (player / team), shrunk toward the positional average share
(red-zone shares toward the player's own volume share), then renormalized within team.
QB1 is the announced starter (priors/qb.py), else depth-chart QB1, else most weighted attempts;
QB2 is next in that order. Rostered players without history enter through the depth chart at a
rank-scaled positional mean share. raw.player_overrides zero out / scale players before renorm.
"""
from __future__ import annotations

import polars as pl

from ..db import read_sql
from . import common

SKILL = ["QB", "RB", "WR", "TE"]
POS_MAP = {"FB": "RB", "HB": "RB"}
SHARE_COLS = ["target_share", "carry_share", "rz_target_share", "rz_carry_share"]


def load_player_weeks(season: int, week: int) -> pl.DataFrame:
    """Player-week rows with team totals and ffopportunity expectations attached."""
    hist = common.history_where(season, week)
    return read_sql(
        f"""
        with ps as (
          select season, week, player_id, team, position,
                 (stats->>'targets')::float as targets, (stats->>'carries')::float as carries,
                 (stats->>'attempts')::float as attempts, (stats->>'receptions')::float as receptions,
                 (stats->>'receiving_yards')::float as rec_yds, (stats->>'rushing_yards')::float as rush_yds,
                 (stats->>'receiving_tds')::float as rec_td, (stats->>'rushing_tds')::float as rush_td
          from raw.player_stats_weekly where {hist}
        ), tt as (
          select season, week, team, sum(targets) as team_targets, sum(carries) as team_carries
          from ps group by 1, 2, 3
        ), op as (
          select season, week, player_id,
                 (stats->>'rec_attempt')::float as rec_att_opp, (stats->>'rush_attempt')::float as rush_att_opp,
                 (stats->>'receptions_exp')::float as rec_exp,
                 (stats->>'rec_yards_gained_exp')::float as rec_yds_exp,
                 (stats->>'rush_yards_gained_exp')::float as rush_yds_exp,
                 (stats->>'rec_touchdown_exp')::float as rec_td_exp,
                 (stats->>'rush_touchdown_exp')::float as rush_td_exp,
                 posteam
          from raw.ff_opportunity_weekly where {hist}
        ), ot as (
          select season, week, posteam as team, sum(rec_td_exp) as team_rec_td_exp,
                 sum(rush_td_exp) as team_rush_td_exp
          from op group by 1, 2, 3
        ), sn as (
          select s.season, s.week, p.gsis_id as player_id, s.offense_pct
          from raw.snap_counts s join raw.players p on p.pfr_id = s.pfr_player_id
          where {common.history_where(season, week, "s")}
        )
        select ps.*, tt.team_targets, tt.team_carries,
               op.rec_att_opp, op.rush_att_opp, op.rec_exp, op.rec_yds_exp, op.rush_yds_exp,
               op.rec_td_exp, op.rush_td_exp, ot.team_rec_td_exp, ot.team_rush_td_exp,
               sn.offense_pct
        from ps
        join tt on tt.season = ps.season and tt.week = ps.week and tt.team = ps.team
        left join op on op.season = ps.season and op.week = ps.week and op.player_id = ps.player_id
        left join ot on ot.season = ps.season and ot.week = ps.week and ot.team = ps.team
        left join sn on sn.season = ps.season and sn.week = ps.week and sn.player_id = ps.player_id
        where ps.position in ('QB','RB','WR','TE','FB','HB')
        """
    ).with_columns(pl.col("position").replace(POS_MAP))


def load_roster(season: int, week: int) -> pl.DataFrame:
    """Active offensive skill players on each team's latest roster at or before the target week.

    Bye-week teams have no roster rows for that week, so the latest week is taken per team.
    """
    return read_sql(
        f"""
        with latest as (
          select team, max(week) as week from raw.rosters_weekly
          where season = {season} and week <= {week} group by team
        )
        select r.team, r.gsis_id as player_id, r.position, r.full_name
        from raw.rosters_weekly r join latest l on l.team = r.team and l.week = r.week
        where r.season = {season} and r.status = 'ACT'
          and r.position in ('QB','RB','WR','TE','FB','HB')
        """
    ).with_columns(pl.col("position").replace(POS_MAP))


def build(pw: pl.DataFrame, roster: pl.DataFrame, season: int, week: int, c: dict,
          starters: pl.DataFrame | None = None, depth: pl.DataFrame | None = None,
          overrides: pl.DataFrame | None = None) -> pl.DataFrame:
    """Pure: player-weeks + roster (+ starters, depth chart, overrides) -> usage priors.

    One row per active player with history, plus depth-chart cold starts when `depth` is given.
    """
    g = common.with_weights(pw, season, week, c)
    raw = g.group_by("player_id").agg(
        common.n_games().alias("n_eff"),
        pl.col("position").last(),
        common.weighted_ratio("targets", "team_targets").alias("_target_share"),
        common.weighted_ratio("carries", "team_carries").alias("_carry_share"),
        common.weighted_ratio("rec_td_exp", "team_rec_td_exp").alias("_rz_target_share"),
        common.weighted_ratio("rush_td_exp", "team_rush_td_exp").alias("_rz_carry_share"),
        ((pl.col("w") * pl.col("offense_pct")).sum() / (pl.col("w") * pl.col("offense_pct").is_not_null()).sum())
        .alias("snap_pct"),
        (pl.col("w") * pl.col("attempts")).sum().alias("w_attempts"),
    )
    # positional average share among players with history (n_eff-weighted)
    pos_mean = raw.group_by("position").agg(
        [((pl.col(f"_{s}") * pl.col("n_eff")).sum() / pl.col("n_eff").sum()).alias(f"pm_{s}")
         for s in SHARE_COLS]
    )
    k = float(c["shrink_k_usage"])
    out = raw.join(pos_mean, on="position", how="left").with_columns(
        common.shrink(pl.col("_target_share"), pl.col("n_eff"), pl.col("pm_target_share"), k).alias("target_share"),
        common.shrink(pl.col("_carry_share"), pl.col("n_eff"), pl.col("pm_carry_share"), k).alias("carry_share"),
    ).with_columns(
        # red-zone shares shrink toward the player's own volume share, not the positional mean:
        # a low-volume player's TD chances track his touches until the _exp data says otherwise
        common.shrink(pl.col("_rz_target_share"), pl.col("n_eff"), pl.col("target_share"), k).alias("rz_target_share"),
        common.shrink(pl.col("_rz_carry_share"), pl.col("n_eff"), pl.col("carry_share"), k).alias("rz_carry_share"),
    )
    # attach to the active roster: roster team wins
    ros = roster.select(["team", "player_id", "full_name", pl.col("position").alias("_ros_pos")])
    out = ros.join(out, on="player_id", how="inner").drop("_ros_pos")
    # cold start: rostered players without history but on the depth chart enter at a rank-scaled
    # positional mean share (they still get renormalized with everyone else)
    if depth is not None and not depth.is_empty():
        rf = {int(k_): float(v) for k_, v in c.get("cold_start_rank_factor", {1: 1.0, 2: 0.6, 3: 0.35, 4: 0.20, 5: 0.12}).items()}
        frac = float(c.get("cold_start_frac", 0.6))
        cold = (
            ros.join(out.select("player_id"), on="player_id", how="anti")
            .join(depth.select(["player_id", "depth_rank"]), on="player_id", how="inner")
            .filter(pl.col("depth_rank").is_in(list(rf)))
            .rename({"_ros_pos": "position"})
            .join(pos_mean, on="position", how="left")
            .with_columns(pl.col("depth_rank").replace_strict(rf, default=0.0, return_dtype=pl.Float64).alias("_rf"))
            .with_columns(
                [(pl.col(f"pm_{s}") * pl.col("_rf") * frac).fill_null(0.0).alias(s) for s in SHARE_COLS]
            )
            .with_columns(pl.lit(0.0).alias("n_eff"), pl.lit(None, dtype=pl.Float64).alias("snap_pct"),
                          pl.lit(0.0).alias("w_attempts"))
            .select(["team", "player_id", "full_name", "position", "n_eff", "w_attempts", "snap_pct", *SHARE_COLS])
        )
        out = pl.concat([out.select(cold.columns), cold])
    # manual overrides: out/doubtful zero the player; usage_multiplier scales shares before renorm
    if overrides is not None and not overrides.is_empty():
        ov = overrides.select(
            "player_id",
            pl.when(pl.col("status").str.to_lowercase().is_in(["out", "doubtful", "ir"])).then(0.0)
            .otherwise(pl.col("usage_multiplier").fill_null(1.0)).cast(pl.Float64).alias("_mult"),
        )
        out = out.join(ov, on="player_id", how="left").with_columns(pl.col("_mult").fill_null(1.0))
        out = out.with_columns([(pl.col(s) * pl.col("_mult")).alias(s) for s in SHARE_COLS])
    else:
        out = out.with_columns(pl.lit(1.0).alias("_mult"))
    # QB1: announced starter (schedules) if rostered and not ruled out; else depth-chart QB1;
    # else most weighted attempts. QB2: next by the same ordering (takes the non-starter attempts).
    qbs = out.filter((pl.col("position") == "QB") & (pl.col("_mult") > 0))
    if starters is not None and not starters.is_empty():
        qbs = qbs.join(starters.select(["team", pl.col("qb_id").alias("_starter")]), on="team", how="left") \
            .with_columns((pl.col("player_id") == pl.col("_starter")).fill_null(False).alias("_is_starter"))
    else:
        qbs = qbs.with_columns(pl.lit(False).alias("_is_starter"))
    if depth is not None and not depth.is_empty():
        qbs = qbs.join(depth.select(["player_id", "depth_rank"]), on="player_id", how="left")
    else:
        qbs = qbs.with_columns(pl.lit(None, dtype=pl.Int32).alias("depth_rank"))
    qbs = qbs.with_columns(pl.col("depth_rank").fill_null(99)).sort(
        ["team", "_is_starter", "depth_rank", "w_attempts"], descending=[False, True, False, True]
    ).with_columns(pl.int_range(pl.len()).over("team").alias("_rank"))
    flags = qbs.select("player_id", (pl.col("_rank") == 0).alias("is_qb1"), (pl.col("_rank") == 1).alias("is_qb2"))
    out = out.join(flags, on="player_id", how="left").with_columns(
        pl.col("is_qb1").fill_null(False), pl.col("is_qb2").fill_null(False)
    )
    # renormalize within team: targets among non-QBs, carries among everyone
    non_qb = pl.col("position") != "QB"
    out = out.with_columns(
        pl.when(non_qb).then(pl.col("target_share")).otherwise(0.0).alias("target_share"),
        pl.when(non_qb).then(pl.col("rz_target_share")).otherwise(0.0).alias("rz_target_share"),
    ).with_columns(
        [(pl.col(s) / pl.col(s).sum().over("team")).fill_nan(0.0).alias(s) for s in SHARE_COLS]
    )
    cols = ["team", "player_id", "full_name", "position", "is_qb1", "is_qb2", "n_eff", *SHARE_COLS, "snap_pct"]
    return out.select(cols).with_columns(pl.lit(season).alias("season"), pl.lit(week).alias("week")) \
        .sort(["team", "target_share", "carry_share"], descending=[False, True, True])


def load_overrides(season: int, week: int) -> pl.DataFrame:
    return read_sql(
        "select player_id, status, usage_multiplier::float8 as usage_multiplier "
        "from raw.player_overrides where season = %s and week = %s",
        (season, week),
    )


def usage_priors(season: int, week: int, c: dict | None = None, starters: pl.DataFrame | None = None,
                 depth: pl.DataFrame | None = None) -> pl.DataFrame:
    c = c or common.cfg()
    return build(load_player_weeks(season, week), load_roster(season, week), season, week, c,
                 starters=starters, depth=depth, overrides=load_overrides(season, week))
