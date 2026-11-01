"""Defense priors: each active defender's share of his team's sacks, interceptions and fumble recoveries.

Sources (all through the (season, week) leakage filter):
  raw.defender_weeks   typed sacks / ints / fum_rec per player-week (view over raw.player_stats_weekly)
  raw.snap_counts      defense_pct, joined gsis<->pfr through raw.players
  raw.rosters_weekly   active DL / LB / DB at the target week (published pre-game; not leakage)
  raw.depth_charts     defensive depth rank, for rostered defenders with no history

A share is a weighted ratio of sums (player events / team events in his games), shrunk toward his
group's mean share scaled by his defensive snap share relative to the group, so a backup shrinks toward
a backup's share, not a starter's. Defenders without history enter through the depth chart at a
rank-scaled group mean share. The roster team wins, ruled-out overrides zero a player, and shares are
renormalized within team. Team event totals come from the game sim; these shares only split them.
"""
from __future__ import annotations

import polars as pl

from ..db import read_sql
from . import common, depth

GROUPS = ("DL", "LB", "DB")
EVENTS = {"sack_share": ("sacks", "team_sacks"), "int_share": ("ints", "team_ints"),
          "fr_share": ("fum_rec", "team_fum_rec")}
SHARE_COLS = tuple(EVENTS)
RULED_OUT = ("out", "doubtful", "ir")
DEPTH_GROUP = {
    **{p: "DL" for p in ("DE", "DT", "NT", "DL", "EDGE", "RUSH", "LDE", "RDE", "LDT", "RDT")},
    **{p: "LB" for p in ("LB", "OLB", "ILB", "MLB", "SAM", "WILL", "MIKE", "WLB", "SLB", "LILB",
                         "RILB", "LOLB", "ROLB")},
    **{p: "DB" for p in ("CB", "S", "FS", "SS", "DB", "LCB", "RCB", "NCB", "NB", "NKL", "NDB")},
}


def load_def_weeks(season: int, week: int) -> pl.DataFrame:
    """Defender-weeks with team totals and defensive snap share attached."""
    hist = common.history_where(season, week, "d")
    return read_sql(
        f"""
        with d as (
          select season, week, player_id, team, def_group,
                 sacks::float8 as sacks, ints::float8 as ints, fum_rec::float8 as fum_rec
          from raw.defender_weeks d where {hist}
        ), tt as (
          select season, week, team, sum(sacks) as team_sacks, sum(ints) as team_ints,
                 sum(fum_rec) as team_fum_rec
          from d group by 1, 2, 3
        ), sn as (
          select s.season, s.week, p.gsis_id as player_id, s.defense_pct::float8 as defense_pct
          from raw.snap_counts s join raw.players p on p.pfr_id = s.pfr_player_id
          where {common.history_where(season, week, "s")}
        )
        select d.*, tt.team_sacks, tt.team_ints, tt.team_fum_rec, sn.defense_pct
        from d
        join tt on tt.season = d.season and tt.week = d.week and tt.team = d.team
        left join sn on sn.season = d.season and sn.week = d.week and sn.player_id = d.player_id
        """
    )


def load_roster(season: int, week: int) -> pl.DataFrame:
    """Active DL / LB / DB on each team's latest roster at or before the target week."""
    return read_sql(
        f"""
        with latest as (
          select team, max(week) as week from raw.rosters_weekly
          where season = {season} and week <= {week} group by team
        )
        select r.team, r.gsis_id as player_id, r.full_name, r.position
        from raw.rosters_weekly r join latest l on l.team = r.team and l.week = r.week
        where r.season = {season} and r.status = 'ACT' and r.position in ('DL', 'LB', 'DB')
        """
    )


def load_depth(season: int, week: int) -> pl.DataFrame:
    return depth.load_depth(season, week, tuple(DEPTH_GROUP), DEPTH_GROUP)


def build(dw: pl.DataFrame, roster: pl.DataFrame, season: int, week: int, c: dict,
          depth_df: pl.DataFrame | None = None, overrides: pl.DataFrame | None = None) -> pl.DataFrame:
    """Pure: defender-weeks + roster (+ depth chart, overrides) -> defense priors, one row per defender."""
    cols = ["team", "player_id", "full_name", "position", "n_eff", *SHARE_COLS]
    if roster.is_empty() or dw.is_empty():
        return pl.DataFrame(schema={**{k: pl.Utf8 for k in cols[:4]},
                                    **{k: pl.Float64 for k in cols[4:]},
                                    "season": pl.Int64, "week": pl.Int64})
    g = common.with_weights(dw, season, week, c)
    has_snap = pl.col("defense_pct").is_not_null()
    hist = g.group_by("player_id").agg(
        common.n_eff_kish().alias("n_eff"),
        pl.col("def_group").last(),
        *[common.weighted_ratio(n, d).fill_nan(None).alias(f"_{s}") for s, (n, d) in EVENTS.items()],
        ((pl.col("w") * pl.col("defense_pct")).sum() / (pl.col("w") * has_snap).sum())
        .fill_nan(None).alias("snap"),
    )

    def _mean(col: str) -> pl.Expr:
        ok = pl.col(col).is_not_null()
        return (pl.col(col).fill_null(0.0) * pl.col("n_eff")).sum() / (pl.col("n_eff") * ok).sum()

    gm = hist.group_by("def_group").agg(
        *[_mean(f"_{s}").alias(f"pm_{s}") for s in SHARE_COLS], _mean("snap").alias("pm_snap"),
    ).rename({"def_group": "position"})
    k = float(c["shrink_k_usage"])
    ros = roster.select(["team", "player_id", "full_name", "position"])
    seen = ros.join(hist.drop("def_group"), on="player_id", how="inner").join(gm, on="position", how="left")
    rel = (pl.col("snap") / pl.col("pm_snap")).fill_nan(None).fill_null(1.0)
    seen = seen.with_columns(
        [common.shrink(pl.col(f"_{s}"), pl.col("n_eff"), pl.col(f"pm_{s}") * rel, k).alias(s)
         for s in SHARE_COLS]
    ).select(cols)
    parts = [seen]
    if depth_df is not None and not depth_df.is_empty():
        rf = {int(r): float(v) for r, v in c.get("cold_start_rank_factor", {1: 1.0}).items()}
        frac = float(c.get("cold_start_frac", 0.6))
        cold = (
            ros.join(hist.select("player_id"), on="player_id", how="anti")
            .join(depth_df.select(["player_id", "depth_rank"]), on="player_id", how="inner")
            .filter(pl.col("depth_rank").is_in(list(rf)))
            .join(gm, on="position", how="left")
            .with_columns(pl.col("depth_rank").replace_strict(rf, default=0.0, return_dtype=pl.Float64)
                          .alias("_rf"), pl.lit(0.0).alias("n_eff"))
            .with_columns([(pl.col(f"pm_{s}") * pl.col("_rf") * frac).fill_null(0.0).alias(s)
                           for s in SHARE_COLS])
            .select(cols)
        )
        parts.append(cold)
    out = pl.concat(parts)
    if overrides is not None and not overrides.is_empty():
        out_ids = overrides.filter(pl.col("status").str.to_lowercase().is_in(RULED_OUT))["player_id"]
        out = out.filter(~pl.col("player_id").is_in(out_ids.to_list()))
    out = out.with_columns(
        [(pl.col(s) / pl.col(s).sum().over("team")).fill_nan(0.0).fill_null(0.0).alias(s)
         for s in SHARE_COLS]
    ).filter(pl.sum_horizontal(*SHARE_COLS) > 0)
    return out.with_columns(pl.lit(season).alias("season"), pl.lit(week).alias("week")) \
        .sort(["team", "sack_share"], descending=[False, True])


def defense_priors(season: int, week: int, c: dict | None = None,
                   overrides: pl.DataFrame | None = None) -> pl.DataFrame:
    c = c or common.cfg()
    return build(load_def_weeks(season, week), load_roster(season, week), season, week, c,
                 depth_df=load_depth(season, week), overrides=overrides)
