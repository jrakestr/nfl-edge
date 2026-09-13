"""Fit recency_half_life_weeks on 2024+2025 OOS realized share / off_ppd / YPA.

Do not score against posted lines. Primary score is usage share MAE + team PPD MAE.
"""
from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from ..priors import common, qb, team, usage

GRID = (4, 6, 8, 10, 12, 16, 20, 26, 36, 52)
SCORE_SEASONS = (2024, 2025)
REG_WEEKS = tuple(range(1, 19))


@dataclass
class HalfLifeScore:
    h: float
    usage_mae: float
    ppd_mae: float
    ypa_mae: float

    @property
    def primary(self) -> float:
        return self.usage_mae + self.ppd_mae


def _realized_players() -> pl.DataFrame:
    from ..db import read_sql

    ps = read_sql(
        """
        select season, week, player_id, team,
               coalesce((stats->>'targets')::float, 0) as targets,
               coalesce((stats->>'carries')::float, 0) as carries,
               coalesce((stats->>'attempts')::float, 0) as attempts,
               coalesce((stats->>'passing_yards')::float, 0) as pass_yds
        from raw.player_stats_weekly
        where season in (2024, 2025) and week between 1 and 18
          and position in ('QB','RB','WR','TE','FB','HB')
        """
    )
    team_vol = ps.group_by(["season", "week", "team"]).agg(
        pl.col("targets").sum().alias("team_targets"),
        pl.col("carries").sum().alias("team_carries"),
    )
    return ps.join(team_vol, on=["season", "week", "team"])


def _realized_teams() -> pl.DataFrame:
    from ..db import read_sql

    return read_sql(
        """
        select season, week, team, points::float as points, drives::float as drives
        from raw.team_game_agg
        where season in (2024, 2025) and week between 1 and 18
        """
    )


def _history_mask(season: int, week: int) -> pl.Expr:
    return (
        ((pl.col("season") >= season - 3) & (pl.col("season") < season) & (pl.col("week") != 18))
        | ((pl.col("season") == season) & (pl.col("week") < week))
    )


def load_week_cache() -> dict[tuple[int, int], dict]:
    """Two bulk history loads (2024 wk18 window + 2025 wk18 window), then per-week filters."""
    pw = pl.concat([usage.load_player_weeks(2024, 19), usage.load_player_weeks(2025, 19)]).unique(
        subset=["season", "week", "player_id"]
    )
    games = pl.concat([team.load_team_games(2024, 19), team.load_team_games(2025, 19)]).unique(
        subset=["season", "week", "team"]
    )
    qw = pl.concat([qb.load_qb_weeks(2024, 19), qb.load_qb_weeks(2025, 19)]).unique(
        subset=["season", "week", "player_id"]
    )
    print(f"history pw={pw.height} games={games.height} qw={qw.height}", flush=True)
    cache: dict[tuple[int, int], dict] = {}
    for season in SCORE_SEASONS:
        for week in REG_WEEKS:
            mask = _history_mask(season, week)
            cache[(season, week)] = {
                "pw": pw.filter(mask),
                "roster": usage.load_roster(season, week),
                "games": games.filter(mask),
                "qw": qw.filter(mask),
                "starters": qb.load_starters(season, week),
            }
    return cache


def _usage_mae(u: pl.DataFrame, realized: pl.DataFrame) -> float:
    act = realized.filter((pl.col("team_targets") > 0) | (pl.col("team_carries") > 0))
    j = u.join(act, on="player_id", how="inner")
    if j.is_empty():
        return float("nan")
    errs: list[float] = []
    tgt = j.filter(pl.col("team_targets") > 0)
    if tgt.height:
        errs.append(float((tgt["target_share"] - tgt["targets"] / tgt["team_targets"]).abs().mean()))
    car = j.filter(pl.col("team_carries") > 0)
    if car.height:
        errs.append(float((car["carry_share"] - car["carries"] / car["team_carries"]).abs().mean()))
    return float(sum(errs) / len(errs)) if errs else float("nan")


def _ppd_mae(priors: team.TeamPriors, realized: pl.DataFrame) -> float:
    act = realized.filter(pl.col("drives") > 0).with_columns(
        (pl.col("points") / pl.col("drives")).alias("act_ppd")
    )
    j = priors.teams.join(act, on="team", how="inner")
    if j.is_empty():
        return float("nan")
    return float((j["off_ppd"] - j["act_ppd"]).abs().mean())


def _ypa_mae(q: pl.DataFrame, realized: pl.DataFrame) -> float:
    act = realized.filter(pl.col("attempts") > 0).with_columns(
        (pl.col("pass_yds") / pl.col("attempts")).alias("act_ypa")
    )
    j = q.join(act, left_on="qb_id", right_on="player_id", how="inner")
    if j.is_empty():
        return float("nan")
    return float((j["qb_ypa"] - j["act_ypa"]).abs().mean())


def score_h(h: float, cache: dict[tuple[int, int], dict], rp: pl.DataFrame,
            rt: pl.DataFrame, base: dict) -> HalfLifeScore:
    c = {**base, "recency_half_life_weeks": h}
    usage_errs, ppd_errs, ypa_errs = [], [], []
    print(f"scoring H={h:g}", flush=True)
    for (season, week), d in cache.items():
        rp_w = rp.filter((pl.col("season") == season) & (pl.col("week") == week))
        rt_w = rt.filter((pl.col("season") == season) & (pl.col("week") == week))
        u = usage.build(d["pw"], d["roster"], season, week, c, starters=d["starters"])
        usage_errs.append(_usage_mae(u, rp_w))
        tp = team.build(d["games"], season, week, c)
        ppd_errs.append(_ppd_mae(tp, rt_w))
        fb = (
            d["qw"].group_by(["team", "player_id"]).agg(pl.col("attempts").sum())
            .sort("attempts", descending=True)
            .group_by("team").agg(pl.col("player_id").first())
        )
        q = qb.build(d["qw"], d["starters"], fb, season, week, c)
        ypa_errs.append(_ypa_mae(q, rp_w))
    return HalfLifeScore(
        h=h,
        usage_mae=float(pl.Series(usage_errs).mean()),
        ppd_mae=float(pl.Series(ppd_errs).mean()),
        ypa_mae=float(pl.Series(ypa_errs).mean()),
    )


def fit(cache: dict[tuple[int, int], dict] | None = None) -> tuple[HalfLifeScore, list[HalfLifeScore]]:
    base = {k: v for k, v in common.cfg().items() if k != "recency_half_life_weeks"}
    cache = cache if cache is not None else load_week_cache()
    rp, rt = _realized_players(), _realized_teams()
    curve = [score_h(float(h), cache, rp, rt, base) for h in GRID]
    winner = min(curve, key=lambda s: s.primary)
    return winner, curve


def format_curve(curve: list[HalfLifeScore], winner: HalfLifeScore) -> str:
    lines = [
        "H  usage_mae  ppd_mae  primary  ypa_mae",
        "--  ---------  -------  -------  -------",
    ]
    for s in curve:
        mark = " *" if s.h == winner.h else "  "
        lines.append(
            f"{s.h:4.0f}{mark} {s.usage_mae:.5f}  {s.ppd_mae:.5f}  {s.primary:.5f}  {s.ypa_mae:.5f}"
        )
    return "\n".join(lines)


def format_season_mass(season: int, week: int, h: float) -> str:
    """Weight-mass share by history season at (season, week) for the chosen H."""
    games = team.load_team_games(season, week)
    mass = common.season_weight_mass(games, season, week, {"recency_half_life_weeks": h})
    tot = float(mass["mass"].sum())
    lines = [f"season weight mass at {season} week {week}, H={h:g} (team-game rows):"]
    for row in mass.iter_rows(named=True):
        share = float(row["share"])
        flag = "  <2%" if row["season"] == season - 3 and share < 0.02 else ""
        lines.append(f"  {row['season']}: {share:.3%} ({row['mass']:.2f}/{tot:.2f}){flag}")
    s3 = mass.filter(pl.col("season") == season - 3)
    if s3.is_empty():
        lines.append(f"  S-3 ({season - 3}) has no rows — window is not three live seasons.")
    elif float(s3["share"][0]) < 0.02:
        lines.append(
            f"  S-3 carries under 2% at H={h:g}; the honest window is two seasons, not three."
        )
    return "\n".join(lines)


if __name__ == "__main__":
    winner, curve = fit()
    print(format_curve(curve, winner))
    print()
    print(format_season_mass(2026, 1, winner.h))
    print(f"chosen H={winner.h:g} primary={winner.primary:.5f}")
