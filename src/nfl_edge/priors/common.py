"""Shared prior machinery: leakage filter, recency weights, weighted ratios, shrinkage.

Every prior for (season S, week W) reads only rows with `season = S-1 or (season = S and week < W)`,
excluding prior-season week 18 (resting starters). Rows are weighted: current season
`exp(-(W - week) / lookback_weeks)`, prior season `prior_season_weight`. A statistic is
`sum(w * num) / sum(w * den)` — recency on the rate only.

Shrinkage sample size differs by channel:
  usage / efficiency  unweighted count (games; carries/targets)
  team                `sum(w)` — NFL team strength regresses year to year, so recency
                      counts as less evidence
then `n_eff / (n_eff + k)` toward the league or positional value.
"""
from __future__ import annotations

import polars as pl

from ..config import load_yaml


def cfg() -> dict:
    return load_yaml("sim.yaml")["priors"]


def history_where(season: int, week: int, alias: str = "") -> str:
    p = f"{alias}." if alias else ""
    return (
        f"(({p}season = {season - 1} and {p}week <> 18) "
        f"or ({p}season = {season} and {p}week < {week}))"
    )


def drop_prior_week18(df: pl.DataFrame, season: int) -> pl.DataFrame:
    """Drop prior-season week 18 (resting starters) from a history frame."""
    return df.filter(~((pl.col("season") == season - 1) & (pl.col("week") == 18)))


def with_weights(df: pl.DataFrame, season: int, week: int, c: dict) -> pl.DataFrame:
    """Add column `w` following the recency scheme above. Expects `season` and `week` columns."""
    return drop_prior_week18(df, season).with_columns(
        pl.when(pl.col("season") == season)
        .then(((pl.col("week") - week).cast(pl.Float64) / c["lookback_weeks"]).exp())
        .otherwise(pl.lit(float(c["prior_season_weight"])))
        .alias("w")
    )


def n_games() -> pl.Expr:
    """Unweighted game count for usage/efficiency shrinkage. Recency weights do not enter."""
    return pl.len().cast(pl.Float64)


def n_eff_weighted() -> pl.Expr:
    """Recency-weighted sample size for team-channel shrinkage."""
    return pl.col("w").sum()


def weighted_ratio(num: str, den: str) -> pl.Expr:
    return (pl.col("w") * pl.col(num)).sum() / (pl.col("w") * pl.col(den)).sum()


def league_ratio(num: str, den: str) -> pl.Expr:
    return pl.col(num).sum() / pl.col(den).sum()


def shrink(value: pl.Expr, n_eff: pl.Expr, target: pl.Expr | float, k: float) -> pl.Expr:
    """Shrink `value` toward `target` with weight n_eff / (n_eff + k). Null/NaN (0/0) -> target."""
    lam = (n_eff / (n_eff + k)).fill_nan(0.0).fill_null(0.0)
    v = value.fill_nan(None).fill_null(target)
    return (lam * v + (1 - lam) * target).fill_null(target)
