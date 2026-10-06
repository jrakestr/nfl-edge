"""League of Champions luck: expected wins from projections and from all-play, per team-week.

Descriptive season statistic for the fantasy league. It is not evidence about the NFL model and nothing
in sim/ or priors/ reads it. Pure function over fantasy.loc_weekly_scores; espn_league.run persists the
result in fantasy.loc_luck. Only final weeks enter, and at least two are needed.

  bias = mean(proj - actual) over final team-weeks        sd = sample SD of (actual - proj)
  projected win prob = Phi((proj - opp_proj) / (sd * sqrt 2))
  earned win prob    = Phi((actual - (opp_proj - bias)) / sd)
  actual win         = 1, 0.5 on a tie, 0
  all-play share     = teams with a lower score that week / (teams - 1)
Bias and sd are fitted from the data on every call and stored on each row with the sample size.
"""
from __future__ import annotations

from datetime import datetime

import polars as pl
from scipy.stats import norm

MIN_FINAL_WEEKS = 2
COLUMNS = ["season", "week", "espn_team_id", "proj_win_prob", "earned_win_prob", "actual_win",
           "allplay_share", "bias", "sd", "n_team_weeks", "computed_at"]
SCHEMA = {"season": pl.Int64, "week": pl.Int64, "espn_team_id": pl.Int64, "proj_win_prob": pl.Float64,
          "earned_win_prob": pl.Float64, "actual_win": pl.Float64, "allplay_share": pl.Float64,
          "bias": pl.Float64, "sd": pl.Float64, "n_team_weeks": pl.Int64,
          "computed_at": pl.Datetime("us", "UTC")}


def empty() -> pl.DataFrame:
    return pl.DataFrame(schema=SCHEMA)


def final_weeks(weekly: pl.DataFrame) -> list[int]:
    """Weeks where every team row is final."""
    if weekly.is_empty():
        return []
    g = weekly.group_by("week").agg(pl.col("is_final").all().alias("all_final"))
    return sorted(g.filter(pl.col("all_final"))["week"].to_list())


def compute_luck(weekly: pl.DataFrame, computed_at: datetime) -> pl.DataFrame:
    """One season's weekly frame in, one luck row per final team-week out (none under two final weeks)."""
    weeks = final_weeks(weekly)
    if len(weeks) < MIN_FINAL_WEEKS:
        return empty()
    f = weekly.filter(pl.col("week").is_in(weeks))
    if f["season"].n_unique() != 1:
        raise ValueError("luck is computed one season at a time")

    opp = f.select("week", pl.col("espn_team_id").alias("opp_espn_team_id"),
                   pl.col("proj_pts").alias("opp_proj"), pl.col("actual_pts").alias("opp_actual"))
    j = f.join(opp, on=["week", "opp_espn_team_id"], how="left")
    if j["opp_proj"].null_count():
        raise ValueError("a final team-week has no opponent row; luck was not computed")

    err = j["actual_pts"] - j["proj_pts"]
    n = j.height
    sd = float(err.std(ddof=1))
    if not sd > 0:
        raise ValueError("projection error has no spread (sd = 0); luck was not computed")
    bias = float(-err.mean())

    scores = f.select("week", "actual_pts")
    teams = f.group_by("week").agg(pl.len().alias("teams"))
    beaten = (j.select("week", "espn_team_id", "actual_pts")
              .join(scores, on="week", suffix="_o")
              .group_by("week", "espn_team_id", maintain_order=True)
              .agg((pl.col("actual_pts_o") < pl.col("actual_pts")).sum().alias("beaten")))
    j = j.join(beaten, on=["week", "espn_team_id"]).join(teams, on="week")

    out = j.select(
        "season", "week", "espn_team_id",
        pl.Series("proj_win_prob", norm.cdf(((j["proj_pts"] - j["opp_proj"]) / (sd * 2 ** 0.5)).to_numpy())),
        pl.Series("earned_win_prob", norm.cdf(((j["actual_pts"] - (j["opp_proj"] - bias)) / sd).to_numpy())),
        pl.when(pl.col("actual_pts") > pl.col("opp_actual")).then(1.0)
        .when(pl.col("actual_pts") == pl.col("opp_actual")).then(0.5).otherwise(0.0).alias("actual_win"),
        (pl.col("beaten") / (pl.col("teams") - 1)).alias("allplay_share"),
        pl.lit(bias).alias("bias"), pl.lit(sd).alias("sd"), pl.lit(n).cast(pl.Int64).alias("n_team_weeks"),
        pl.lit(computed_at).alias("computed_at"),
    ).sort("week", "espn_team_id")
    return out.select(COLUMNS).cast(SCHEMA)
