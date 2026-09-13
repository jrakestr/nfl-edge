"""Shared prior machinery: leakage filter, recency weights, weighted ratios, shrinkage.

Every prior for (season S, week W) reads only rows with
`((season >= S-3 and season < S and week <> 18) or (season = S and week < W))`,
so week 18 of every prior season is out (resting starters). Rows are weighted
`w = 2 ** (-age_weeks / H)` with `age_weeks = (S - season) * 18 + (W - week)` and
`H = recency_half_life_weeks`. A statistic is `sum(w * num) / sum(w * den)` —
recency on the rate only.

Shrinkage `n_eff` is Kish `(Σw)² / Σw²` on the weights that enter the shrunk mean:
  usage / team / QB start-share  per-row recency `w`
  efficiency / QB YPA            touch-level `n · w`
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
        f"(({p}season >= {season - 3} and {p}season < {season} and {p}week <> 18) "
        f"or ({p}season = {season} and {p}week < {week}))"
    )


def drop_prior_week18(df: pl.DataFrame, season: int) -> pl.DataFrame:
    """Drop week 18 (resting starters) from every season before the target season."""
    return df.filter(~((pl.col("season") < season) & (pl.col("week") == 18)))


def age_weeks(season: int, week: int) -> pl.Expr:
    """Weeks of age of a history row relative to target (season, week)."""
    return (season - pl.col("season")) * 18 + (week - pl.col("week"))


def with_weights(df: pl.DataFrame, season: int, week: int, c: dict) -> pl.DataFrame:
    """Add column `w` following the recency scheme above. Expects `season` and `week` columns."""
    h = float(c["recency_half_life_weeks"])
    return drop_prior_week18(df, season).with_columns(
        (2.0 ** (-age_weeks(season, week).cast(pl.Float64) / h)).alias("w")
    )


def season_weight_mass(df: pl.DataFrame, season: int, week: int, c: dict) -> pl.DataFrame:
    """Share of total recency weight carried by each history season."""
    g = with_weights(df, season, week, c)
    tot = g["w"].sum()
    return (
        g.group_by("season").agg(pl.col("w").sum().alias("mass"))
        .with_columns((pl.col("mass") / tot).alias("share"))
        .sort("season")
    )


def n_games() -> pl.Expr:
    """Unweighted game count. Not the shrink sample size — that is `n_eff_kish`."""
    return pl.len().cast(pl.Float64)


def n_eff_kish(weight: pl.Expr | None = None) -> pl.Expr:
    """Kish effective sample size (Σw)² / Σw² on the weights that enter the shrunk mean."""
    w = pl.col("w") if weight is None else weight
    return (w.sum() ** 2) / (w ** 2).sum()


def n_eff_kish_mass(mass: str) -> pl.Expr:
    """Kish when each row is `mass` unit observations of weight w: (Σ n w)² / Σ n w²."""
    w = pl.col("w")
    n = pl.col(mass)
    return ((n * w).sum() ** 2) / (n * (w ** 2)).sum()


def n_eff_weighted() -> pl.Expr:
    """Deprecated alias: team-channel shrink now uses Kish, not sum(w)."""
    return n_eff_kish()


def weighted_ratio(num: str, den: str) -> pl.Expr:
    return (pl.col("w") * pl.col(num)).sum() / (pl.col("w") * pl.col(den)).sum()


def league_ratio(num: str, den: str) -> pl.Expr:
    return pl.col(num).sum() / pl.col(den).sum()


def shrink(value: pl.Expr, n_eff: pl.Expr, target: pl.Expr | float, k: float) -> pl.Expr:
    """Shrink `value` toward `target` with weight n_eff / (n_eff + k). Null/NaN (0/0) -> target."""
    lam = (n_eff / (n_eff + k)).fill_nan(0.0).fill_null(0.0)
    v = value.fill_nan(None).fill_null(target)
    return (lam * v + (1 - lam) * target).fill_null(target)
