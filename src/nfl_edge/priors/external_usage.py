"""External usage prior shrinkage: learn weekly source weights from graded weeks (< W)
and shrink current-week usage shares toward external projections (FantasyPros, NFLGameSim).

As-of rule: week W of season S fits source accuracy strictly on model.player_proj_actual
and raw.external_players with week < W. Current-week external shares come from pre-game
projections in raw.external_players for (season, week).

Preserves every simulator invariant:
- Out / doubtful / IR overrides remain 0.0.
- QB target_share and rz_target_share remain 0.0.
- All four share columns (target_share, carry_share, rz_target_share, rz_carry_share)
  sum to 1.000 within every team.
"""
from __future__ import annotations

import polars as pl

from ..db import read_sql

SOURCES = ("fantasypros", "nflgamesim")
SHARE_COLS = ("target_share", "carry_share", "rz_target_share", "rz_carry_share")
DEFAULT_MAX_WEIGHT = 0.50
DEFAULT_SHRINK_WEEKS = 2.0


def fit_weights(
    history: list[dict],
    k_weeks: float = DEFAULT_SHRINK_WEEKS,
    max_ext_weight: float = DEFAULT_MAX_WEIGHT,
) -> dict[str, dict[str, float]]:
    """Compute inverse-MAE^2 weights per channel ('carry', 'target') from graded weeks < W.

    Returns {'carry': {'ours': w0, 'fantasypros': w1, 'nflgamesim': w2, 'alpha': a},
             'target': {'ours': w0, 'fantasypros': w1, 'nflgamesim': w2, 'alpha': a}}
    where `alpha` is the total external shrinkage cap scaled by graded week count.
    Empty history -> alpha=0.0, ours=1.0 (no change).
    """
    if not history:
        empty = {"ours": 1.0, "fantasypros": 0.0, "nflgamesim": 0.0, "alpha": 0.0}
        return {"carry": dict(empty), "target": dict(empty)}

    df = pl.DataFrame(history)
    n_weeks = df["week"].n_unique() if "week" in df.columns else 0
    if n_weeks == 0:
        empty = {"ours": 1.0, "fantasypros": 0.0, "nflgamesim": 0.0, "alpha": 0.0}
        return {"carry": dict(empty), "target": dict(empty)}

    sample_ramp = float(n_weeks) / (float(n_weeks) + float(k_weeks))
    out: dict[str, dict[str, float]] = {}

    for channel, positions, our_col, act_col, fp_col, ngs_col in (
        ("carry", ("QB", "RB"), "our_car_sh", "act_car_sh", "fp_car_sh", "ngs_car_sh"),
        ("target", ("RB", "WR", "TE"), "our_tgt_sh", "act_tgt_sh", "fp_tgt_sh", "ngs_tgt_sh"),
    ):
        sub = df.filter(pl.col("position").is_in(positions))
        if sub.is_empty():
            out[channel] = {"ours": 1.0, "fantasypros": 0.0, "nflgamesim": 0.0, "alpha": 0.0}
            continue

        mae_ours = float((sub[our_col] - sub[act_col]).abs().mean() or 0.10)
        inv_ours = 1.0 / max(mae_ours, 1e-4) ** 2

        fp_sub = sub.filter(pl.col("has_fp"))
        if fp_sub.height >= 10:
            mae_fp = float((fp_sub[fp_col] - fp_sub[act_col]).abs().mean() or 0.10)
            inv_fp = 1.0 / max(mae_fp, 1e-4) ** 2
        else:
            inv_fp = 0.0

        ngs_sub = sub.filter(pl.col("has_ngs"))
        if ngs_sub.height >= 10:
            mae_ngs = float((ngs_sub[ngs_col] - ngs_sub[act_col]).abs().mean() or 0.10)
            inv_ngs = 1.0 / max(mae_ngs, 1e-4) ** 2
        else:
            inv_ngs = 0.0

        ext_inv = inv_fp + inv_ngs
        if ext_inv <= 0:
            out[channel] = {"ours": 1.0, "fantasypros": 0.0, "nflgamesim": 0.0, "alpha": 0.0}
            continue

        raw_ext_share = ext_inv / (inv_ours + ext_inv)
        alpha = min(float(max_ext_weight), sample_ramp * raw_ext_share)
        out[channel] = {
            "ours": round(1.0 - alpha, 4),
            "fantasypros": round(inv_fp / ext_inv, 4),
            "nflgamesim": round(inv_ngs / ext_inv, 4),
            "alpha": round(alpha, 4),
        }
    return out


def apply_external_usage(
    usage: pl.DataFrame,
    ext_week: pl.DataFrame,
    weights: dict[str, dict[str, float]],
    ruled_out: set[str] | None = None,
) -> pl.DataFrame:
    """Shrink usage shares toward team-normalized external shares, preserving zeroed players."""
    if usage.is_empty() or ext_week.is_empty():
        return usage
    alpha_c = float((weights.get("carry") or {}).get("alpha", 0.0))
    alpha_t = float((weights.get("target") or {}).get("alpha", 0.0))
    if alpha_c <= 0.0 and alpha_t <= 0.0:
        return usage

    ruled_out = ruled_out or set()
    # Map each source's raw player numbers onto the active usage roster per team
    ros_ids = usage.select(["team", "player_id", "position"])
    src_frames: dict[str, pl.DataFrame] = {}
    for src in SOURCES:
        s_df = ext_week.filter(pl.col("source") == src)
        if s_df.is_empty():
            continue
        joined = ros_ids.join(
            s_df.select(["player_id", "rush_att", "rush_yds", "rec", "rec_yds"]),
            on="player_id",
            how="left",
        ).with_columns(
            pl.when(pl.col("player_id").is_in(list(ruled_out)))
            .then(0.0)
            .otherwise(pl.col("rush_att").fill_null(0.0))
            .alias("_rush_att"),
            pl.when(pl.col("player_id").is_in(list(ruled_out)))
            .then(0.0)
            .otherwise(pl.col("rush_yds").fill_null(0.0))
            .alias("_rush_yds"),
            pl.when((pl.col("position") == "QB") | pl.col("player_id").is_in(list(ruled_out)))
            .then(0.0)
            .otherwise(pl.col("rec").fill_null(0.0))
            .alias("_rec"),
            pl.when((pl.col("position") == "QB") | pl.col("player_id").is_in(list(ruled_out)))
            .then(0.0)
            .otherwise(pl.col("rec_yds").fill_null(0.0))
            .alias("_rec_yds"),
        ).with_columns(
            pl.col("rush_att").is_not_null().sum().over("team").alias("_n_rush_att"),
            (pl.col("rush_yds").fill_null(0.0) > 0).sum().over("team").alias("_n_rush_yds"),
            pl.col("rec").is_not_null().sum().over("team").alias("_n_rec"),
            (pl.col("rec_yds").fill_null(0.0) > 0).sum().over("team").alias("_n_rec_yds"),
        )
        # Prefer rush_att over rush_yds for carry share, rec over rec_yds for target share.
        # Require >= 3 projected players on the team so a partial top-N benchmark paste
        # (e.g. 1-2 stars per team) never zeroes the rest of the roster on team renormalization.
        has_car_team = (pl.col("_n_rush_att") >= 3) | (pl.col("_n_rush_yds") >= 3)
        has_tgt_team = (pl.col("_n_rec") >= 3) | (pl.col("_n_rec_yds") >= 3)
        car_num = pl.when(pl.col("_rush_att").sum().over("team") > 0).then(pl.col("_rush_att")).otherwise(pl.col("_rush_yds"))
        tgt_num = pl.when(pl.col("_rec").sum().over("team") > 0).then(pl.col("_rec")).otherwise(pl.col("_rec_yds"))
        joined = joined.with_columns(
            car_num.alias("_car_num"),
            tgt_num.alias("_tgt_num"),
        ).with_columns(
            pl.when(has_car_team & (pl.col("_car_num").sum().over("team") > 0))
            .then(pl.col("_car_num") / pl.col("_car_num").sum().over("team"))
            .otherwise(None)
            .alias(f"{src}_car_sh"),
            pl.when(has_tgt_team & (pl.col("_tgt_num").sum().over("team") > 0))
            .then(pl.col("_tgt_num") / pl.col("_tgt_num").sum().over("team"))
            .otherwise(None)
            .alias(f"{src}_tgt_sh"),
        )
        src_frames[src] = joined.select(["player_id", f"{src}_car_sh", f"{src}_tgt_sh"])

    if not src_frames:
        return usage

    out = usage
    for src, frame in src_frames.items():
        out = out.join(frame, on="player_id", how="left")
    for src in SOURCES:
        if f"{src}_car_sh" not in out.columns:
            out = out.with_columns(
                pl.lit(None, dtype=pl.Float64).alias(f"{src}_car_sh"),
                pl.lit(None, dtype=pl.Float64).alias(f"{src}_tgt_sh"),
            )

    w_fp_c = float((weights.get("carry") or {}).get("fantasypros", 0.0))
    w_ngs_c = float((weights.get("carry") or {}).get("nflgamesim", 0.0))
    w_fp_t = float((weights.get("target") or {}).get("fantasypros", 0.0))
    w_ngs_t = float((weights.get("target") or {}).get("nflgamesim", 0.0))

    # Weighted external share per player (handling missing source on a team gracefully)
    fp_c_avail = pl.col("fantasypros_car_sh").is_not_null() & (w_fp_c > 0)
    ngs_c_avail = pl.col("nflgamesim_car_sh").is_not_null() & (w_ngs_c > 0)
    c_den = (pl.when(fp_c_avail).then(w_fp_c).otherwise(0.0) + pl.when(ngs_c_avail).then(w_ngs_c).otherwise(0.0))
    c_num = (
        pl.when(fp_c_avail).then(w_fp_c * pl.col("fantasypros_car_sh")).otherwise(0.0)
        + pl.when(ngs_c_avail).then(w_ngs_c * pl.col("nflgamesim_car_sh")).otherwise(0.0)
    )
    ext_car = pl.when(c_den > 0).then(c_num / c_den).otherwise(pl.col("carry_share"))

    fp_t_avail = pl.col("fantasypros_tgt_sh").is_not_null() & (w_fp_t > 0)
    ngs_t_avail = pl.col("nflgamesim_tgt_sh").is_not_null() & (w_ngs_t > 0)
    t_den = (pl.when(fp_t_avail).then(w_fp_t).otherwise(0.0) + pl.when(ngs_t_avail).then(w_ngs_t).otherwise(0.0))
    t_num = (
        pl.when(fp_t_avail).then(w_fp_t * pl.col("fantasypros_tgt_sh")).otherwise(0.0)
        + pl.when(ngs_t_avail).then(w_ngs_t * pl.col("nflgamesim_tgt_sh")).otherwise(0.0)
    )
    ext_tgt = pl.when(t_den > 0).then(t_num / t_den).otherwise(pl.col("target_share"))

    # Keep zeroed-out players at 0.0; blend active players and renormalize per team
    alive_c = (pl.col("carry_share") > 0) & (~pl.col("player_id").is_in(list(ruled_out)))
    alive_t = (pl.col("target_share") > 0) & (pl.col("position") != "QB") & (~pl.col("player_id").is_in(list(ruled_out)))

    new_car = pl.when(alive_c).then((1.0 - alpha_c) * pl.col("carry_share") + alpha_c * ext_car).otherwise(0.0)
    new_rz_car = pl.when(alive_c).then((1.0 - alpha_c) * pl.col("rz_carry_share") + alpha_c * ext_car).otherwise(0.0)
    new_tgt = pl.when(alive_t).then((1.0 - alpha_t) * pl.col("target_share") + alpha_t * ext_tgt).otherwise(0.0)
    new_rz_tgt = pl.when(alive_t).then((1.0 - alpha_t) * pl.col("rz_target_share") + alpha_t * ext_tgt).otherwise(0.0)

    out = out.with_columns(
        new_car.alias("carry_share"),
        new_rz_car.alias("rz_carry_share"),
        new_tgt.alias("target_share"),
        new_rz_tgt.alias("rz_target_share"),
    ).drop(["fantasypros_car_sh", "fantasypros_tgt_sh", "nflgamesim_car_sh", "nflgamesim_tgt_sh"])

    for col in SHARE_COLS:
        if col in out.columns:
            s = pl.col(col).sum().over("team")
            out = out.with_columns(pl.when(s > 0).then(pl.col(col) / s).otherwise(pl.col(col)).alias(col))
    return out


def load_history(season: int, week: int) -> list[dict]:
    """Per-player-week shares from graded weeks strictly before `week`."""
    if week <= 1:
        return []
    df = read_sql(
        """
        select pa.week, pa.player_id, pa.team, pa.position,
               coalesce(pa.proj_targets, 0)::float8 as proj_targets,
               coalesce(pa.actual_targets, 0)::float8 as actual_targets,
               coalesce(pa.proj_carries, 0)::float8 as proj_carries,
               coalesce(pa.actual_carries, 0)::float8 as actual_carries,
               coalesce(fp.rush_att, 0)::float8 as fp_rush_att,
               coalesce(fp.rec, 0)::float8 as fp_rec,
               coalesce(ngs.rush_yds, 0)::float8 as ngs_rush_yds,
               coalesce(ngs.rec_yds, 0)::float8 as ngs_rec_yds
        from model.player_proj_actual pa
        left join raw.external_players fp
          on fp.source = 'fantasypros' and fp.season = pa.season
          and fp.week = pa.week and fp.player_id = pa.player_id
        left join raw.external_players ngs
          on ngs.source = 'nflgamesim' and ngs.season = pa.season
          and ngs.week = pa.week and ngs.player_id = pa.player_id
        where pa.season = %s and pa.week < %s
        """,
        (season, week),
    )
    if df.is_empty():
        return []
    tw = df.with_columns(
        (pl.col("proj_carries") / pl.col("proj_carries").sum().over(["week", "team"])).fill_nan(0.0).alias("our_car_sh"),
        (pl.col("actual_carries") / pl.col("actual_carries").sum().over(["week", "team"])).fill_nan(0.0).alias("act_car_sh"),
        (pl.col("fp_rush_att") / pl.col("fp_rush_att").sum().over(["week", "team"])).fill_nan(0.0).alias("fp_car_sh"),
        (pl.col("ngs_rush_yds") / pl.col("ngs_rush_yds").sum().over(["week", "team"])).fill_nan(0.0).alias("ngs_car_sh"),
        (pl.col("proj_targets") / pl.col("proj_targets").sum().over(["week", "team"])).fill_nan(0.0).alias("our_tgt_sh"),
        (pl.col("actual_targets") / pl.col("actual_targets").sum().over(["week", "team"])).fill_nan(0.0).alias("act_tgt_sh"),
        (pl.col("fp_rec") / pl.col("fp_rec").sum().over(["week", "team"])).fill_nan(0.0).alias("fp_tgt_sh"),
        (pl.col("ngs_rec_yds") / pl.col("ngs_rec_yds").sum().over(["week", "team"])).fill_nan(0.0).alias("ngs_tgt_sh"),
        (pl.col("fp_rush_att").sum().over(["week", "team"]) > 0).alias("has_fp"),
        (pl.col("ngs_rush_yds").sum().over(["week", "team"]) > 0).alias("has_ngs"),
    )
    return tw.to_dicts()


def load_external_week(season: int, week: int) -> pl.DataFrame:
    """Pre-game external player projections for (season, week).

    One row per (source, player_id): a source can carry the same player under two teams
    (a mid-week release to FA), and a duplicate here would double the usage row downstream.
    The latest ingested row wins.
    """
    return read_sql(
        """
        select distinct on (source, player_id)
               source, player_id,
               rush_att::float8 as rush_att,
               rush_yds::float8 as rush_yds,
               rec::float8 as rec,
               rec_yds::float8 as rec_yds
        from raw.external_players
        where season = %s and week = %s and player_id is not null
          and source in ('fantasypros', 'nflgamesim')
        order by source, player_id, ingested_at desc nulls last
        """,
        (season, week),
    )
