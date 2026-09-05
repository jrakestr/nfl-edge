"""FantasyPros weekly ECR -> raw.ff_rankings_weekly (backfillable; the backtest baseline).

`load_ff_rankings("all")` archives the weekly-* pages with roughly one Friday scrape per week.
Each scrape_date is mapped to (season, week) of the next scheduled game day on or after it.
When a week has several scrapes (e.g. Thanksgiving Wed + Fri), the latest one is kept.
"""
from __future__ import annotations

import datetime as dt

import nflreadpy as nfl
import polars as pl

from ..db import upsert

PAGES = ["weekly-qb", "weekly-rb", "weekly-wr", "weekly-te", "weekly-k", "weekly-dst", "weekly-offense"]
OUT_COLS = ["season", "week", "scrape_date", "page_type", "fp_id", "player", "pos", "team",
            "ecr", "sd", "best", "worst"]
MAX_GAP_DAYS = 8  # a scrape more than this far before the next game day is offseason noise


def week_calendar(schedules: pl.DataFrame) -> pl.DataFrame:
    """Distinct (season, week, gameday) rows; gameday as Date."""
    return (
        schedules.select(
            pl.col("season").cast(pl.Int32), pl.col("week").cast(pl.Int32),
            pl.col("gameday").cast(pl.Utf8).str.to_date("%Y-%m-%d", strict=False),
        )
        .drop_nulls()
        .unique()
        .sort("gameday")
    )


def map_scrape_dates(scrape_dates: pl.Series, calendar: pl.DataFrame) -> pl.DataFrame:
    """scrape_date -> (season, week) via the next game day on or after the scrape."""
    sd = pl.DataFrame({"scrape_date": scrape_dates.unique().sort()}).with_columns(
        pl.col("scrape_date").cast(pl.Utf8).str.to_date("%Y-%m-%d", strict=False)
    ).drop_nulls()
    right = calendar.with_columns(pl.col("gameday").alias("scrape_date")).sort("scrape_date")
    joined = sd.join_asof(right, on="scrape_date", strategy="forward").filter(
        pl.col("gameday").is_not_null()
        & ((pl.col("gameday") - pl.col("scrape_date")).dt.total_days() <= MAX_GAP_DAYS)
    )
    return joined.select(["scrape_date", "season", "week"])


def build(rankings: pl.DataFrame, schedules: pl.DataFrame) -> pl.DataFrame:
    w = rankings.filter(pl.col("page_type").is_in(PAGES)).with_columns(
        pl.col("scrape_date").cast(pl.Utf8).str.to_date("%Y-%m-%d", strict=False)
    )
    mapping = map_scrape_dates(w["scrape_date"], week_calendar(schedules))
    w = w.join(mapping, on="scrape_date", how="inner")
    # latest scrape per (season, week, page_type)
    latest = w.group_by(["season", "week", "page_type"]).agg(pl.col("scrape_date").max())
    w = w.join(latest, on=["season", "week", "page_type", "scrape_date"], how="inner")
    w = w.rename({"id": "fp_id"}).filter(pl.col("fp_id").is_not_null())
    w = w.sort("ecr").unique(subset=["season", "week", "page_type", "fp_id"], keep="first")
    return w.select(OUT_COLS).sort(["season", "week", "page_type", "ecr"])


LIVE_PAGES = {"qb": "weekly-qb", "ppr-rb": "weekly-rb", "ppr-wr": "weekly-wr", "ppr-te": "weekly-te",
              "k": "weekly-k", "dst": "weekly-dst"}


def normalize_live(cur: pl.DataFrame) -> pl.DataFrame:
    """The live `week` feed uses its own column names and page keys; map onto the archive shape."""
    out = cur.filter(pl.col("page").is_in(list(LIVE_PAGES))).with_columns(
        pl.col("page").replace_strict(LIVE_PAGES, default=None).alias("page_type"),
        pl.col("fantasypros_id").cast(pl.Utf8).alias("id"),
        pl.col("player_name").alias("player"),
    )
    if "scrape_date" not in out.columns or out["scrape_date"].null_count() == out.height:
        out = out.with_columns(pl.lit(dt.datetime.now(tz=dt.UTC).date().isoformat()).alias("scrape_date"))
    return out


def fetch(seasons: list[int], live: bool = False) -> pl.DataFrame:
    schedules = nfl.load_schedules()
    if live:
        df = build(normalize_live(nfl.load_ff_rankings("week")), schedules)
    else:
        df = build(nfl.load_ff_rankings("all"), schedules)
    return df.filter(pl.col("season").is_in(seasons))


def coverage(df: pl.DataFrame) -> pl.DataFrame:
    """Weeks with consensus per season; the backtest baseline is only defined on these."""
    return (
        df.group_by("season").agg(pl.col("week").n_unique().alias("weeks"),
                                  pl.col("week").min().alias("first_week"),
                                  pl.col("week").max().alias("last_week"))
        .sort("season")
    )


def run(seasons: list[int], week: int | None = None) -> dict:
    df = fetch(seasons, live=week is not None)
    if week is not None:
        df = df.filter(pl.col("week") == week)
    return {"ff_rankings_weekly": upsert(df, "raw.ff_rankings_weekly",
                                         ["season", "week", "page_type", "fp_id"])}
