"""Efficiency priors v1: per player catch rate, yards per target/reception/carry, TD rates.

Two-stage shrinkage: player rate -> blended with the ffopportunity expected rate
(`shrink_to_ffopportunity`), then toward the positional league rate by opportunity count
(`shrink_k_targets`, `shrink_k_carries`). QB-neutralization of receiver efficiency is priors-refine.
"""
from __future__ import annotations

import polars as pl

from . import common
from .usage import load_player_weeks

# name -> (numerator, denominator, ffopportunity-expected numerator or None, sample column)
RATES: dict[str, tuple[str, str, str | None, str]] = {
    "catch_rate": ("receptions", "targets", "rec_exp", "n_targets"),
    "yds_per_target": ("rec_yds", "targets", "rec_yds_exp", "n_targets"),
    "yds_per_rec": ("rec_yds", "receptions", None, "n_targets"),
    "td_per_target": ("rec_td", "targets", "rec_td_exp", "n_targets"),
    "yds_per_carry": ("rush_yds", "carries", "rush_yds_exp", "n_carries"),
    "td_per_carry": ("rush_td", "carries", "rush_td_exp", "n_carries"),
}


def build(pw: pl.DataFrame, season: int, week: int, c: dict) -> pl.DataFrame:
    g = common.with_weights(pw, season, week, c)
    aggs = [
        pl.col("targets").sum().alias("n_targets"),
        pl.col("carries").sum().alias("n_carries"),
        pl.col("position").last(),
    ]
    for name, (num, den, exp, _) in RATES.items():
        aggs.append(common.weighted_ratio(num, den).alias(f"_{name}"))
        if exp:
            aggs.append(common.weighted_ratio(exp, den).alias(f"_{name}_exp"))
    per_player = g.group_by("player_id").agg(aggs)

    pos_league = g.group_by("position").agg(
        [common.league_ratio(num, den).alias(f"pl_{name}") for name, (num, den, _, _) in RATES.items()]
    )
    s = float(c["shrink_to_ffopportunity"])
    ks = {"n_targets": float(c["shrink_k_targets"]), "n_carries": float(c["shrink_k_carries"])}
    out = per_player.join(pos_league, on="position", how="left")
    exprs = []
    for name, (_, _, exp, n_col) in RATES.items():
        r = pl.col(f"_{name}")
        if exp:
            r = pl.coalesce([(1 - s) * r + s * pl.col(f"_{name}_exp"), r])
        exprs.append(common.shrink(r, pl.col(n_col), pl.col(f"pl_{name}"), ks[n_col]).alias(name))
    out = out.with_columns(exprs)
    cols = ["player_id", "position", "n_targets", "n_carries", *RATES]
    return out.select(cols).with_columns(pl.lit(season).alias("season"), pl.lit(week).alias("week"))


def efficiency_priors(season: int, week: int, c: dict | None = None,
                      pw: pl.DataFrame | None = None) -> pl.DataFrame:
    c = c or common.cfg()
    pw = pw if pw is not None else load_player_weeks(season, week)
    return build(pw, season, week, c)
