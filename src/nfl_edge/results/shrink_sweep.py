"""Retune every shrink_k on 2024+2025 OOS realized rates with Kish n_eff. Not lines.

QB-factor / qb_att scoring excludes the eight 2026 week-1 starter-change teams so k
cannot cancel the replacement-floor bias.
"""
from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from ..priors import common, efficiency, qb, team, usage
from .half_life import REG_WEEKS, SCORE_SEASONS, _history_mask, _ppd_mae, _usage_mae, _ypa_mae

# 2026 week-1 starter ≠ lookback QB (STATUS / grade note on run f049d136)
CHANGED_QB_TEAMS = ("MIA", "CLE", "NYJ", "CIN", "LV", "ATL", "WAS", "MIN")

GRIDS: dict[str, tuple[float, ...]] = {
    "shrink_k_usage": (1, 2, 3, 4, 6, 8, 12),
    "shrink_k_targets": (20, 30, 40, 60, 80, 120),
    "shrink_k_carries": (1, 5, 10, 15, 20, 30, 40, 60),
    "shrink_k_qb_att": (50, 75, 100, 150, 200, 300, 400, 600, 800),
    "shrink_k_team": (2, 3, 4, 6, 8, 12),
    "shrink_k_qb_share": (1, 2, 3, 4, 6, 8, 12, 16),
}


@dataclass
class SweepRow:
    key: str
    k: float
    score: float


def load_week_cache() -> dict[tuple[int, int], dict]:
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


def _realized_players() -> pl.DataFrame:
    from ..db import read_sql

    ps = read_sql(
        """
        select season, week, player_id, team,
               coalesce((stats->>'targets')::float, 0) as targets,
               coalesce((stats->>'carries')::float, 0) as carries,
               coalesce((stats->>'receiving_yards')::float, 0) as rec_yds,
               coalesce((stats->>'rushing_yards')::float, 0) as rush_yds,
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


def _ypt_mae(eff: pl.DataFrame, realized: pl.DataFrame) -> float:
    act = realized.filter(pl.col("targets") > 0).with_columns(
        (pl.col("rec_yds") / pl.col("targets")).alias("act")
    )
    j = eff.join(act, on="player_id", how="inner")
    if j.is_empty():
        return float("nan")
    return float((j["yds_per_target"] - j["act"]).abs().mean())


def _ypc_mae(eff: pl.DataFrame, realized: pl.DataFrame) -> float:
    act = realized.filter(pl.col("carries") > 0).with_columns(
        (pl.col("rush_yds") / pl.col("carries")).alias("act")
    )
    j = eff.join(act, on="player_id", how="inner")
    if j.is_empty():
        return float("nan")
    return float((j["yds_per_carry"] - j["act"]).abs().mean())


def _share_mae(q: pl.DataFrame, realized: pl.DataFrame) -> float:
    """Starter attempt share vs realized attempts / team attempts that week."""
    team_att = realized.group_by("team").agg(pl.col("attempts").sum().alias("team_att"))
    act = (
        realized.filter(pl.col("attempts") > 0)
        .join(team_att, on="team")
        .filter(pl.col("team_att") > 0)
        .with_columns((pl.col("attempts") / pl.col("team_att")).alias("act_share"))
    )
    j = q.join(act, left_on="qb_id", right_on="player_id", how="inner")
    if j.is_empty():
        return float("nan")
    return float((j["qb_att_share"] - j["act_share"]).abs().mean())


def _score_key(key: str, cache: dict, rp: pl.DataFrame, rt: pl.DataFrame, c: dict) -> float:
    errs: list[float] = []
    for (season, week), d in cache.items():
        rp_w = rp.filter((pl.col("season") == season) & (pl.col("week") == week))
        rt_w = rt.filter((pl.col("season") == season) & (pl.col("week") == week))
        if key == "shrink_k_usage":
            u = usage.build(d["pw"], d["roster"], season, week, c, starters=d["starters"])
            errs.append(_usage_mae(u, rp_w))
        elif key == "shrink_k_team":
            tp = team.build(d["games"], season, week, c)
            errs.append(_ppd_mae(tp, rt_w))
        elif key == "shrink_k_targets":
            e = efficiency.build(d["pw"], season, week, c)
            errs.append(_ypt_mae(e, rp_w))
        elif key == "shrink_k_carries":
            e = efficiency.build(d["pw"], season, week, c)
            errs.append(_ypc_mae(e, rp_w))
        elif key in ("shrink_k_qb_att", "shrink_k_qb_share"):
            fb = (
                d["qw"].group_by(["team", "player_id"]).agg(pl.col("attempts").sum())
                .sort("attempts", descending=True)
                .group_by("team").agg(pl.col("player_id").first())
            )
            q = qb.build(d["qw"], d["starters"], fb, season, week, c)
            q = q.filter(~pl.col("team").is_in(list(CHANGED_QB_TEAMS)))
            rp_ok = rp_w.filter(~pl.col("team").is_in(list(CHANGED_QB_TEAMS)))
            if key == "shrink_k_qb_att":
                errs.append(_ypa_mae(q, rp_ok))
            else:
                errs.append(_share_mae(q, rp_ok))
        else:
            raise ValueError(key)
    return float(pl.Series(errs).mean())


def sweep(cache: dict | None = None) -> tuple[dict[str, float], dict[str, float], list[SweepRow]]:
    base = dict(common.cfg())
    old = {k: float(base[k]) for k in GRIDS}
    cache = cache if cache is not None else load_week_cache()
    rp, rt = _realized_players(), _realized_teams()
    rows: list[SweepRow] = []
    winners: dict[str, float] = {}
    for key, grid in GRIDS.items():
        print(f"sweep {key}", flush=True)
        best_k, best_score = None, None
        for k in grid:
            c = {**base, key: k}
            score = _score_key(key, cache, rp, rt, c)
            rows.append(SweepRow(key, float(k), score))
            print(f"  {key}={k:g}  mae={score:.5f}", flush=True)
            if best_score is None or score < best_score:
                best_k, best_score = float(k), score
        winners[key] = best_k
    return old, winners, rows


def format_report(old: dict[str, float], winners: dict[str, float], rows: list[SweepRow]) -> str:
    lines = [
        "shrink_k sweep (2024+2025 OOS, Kish n_eff, not lines)",
        f"QB scoring excluded {', '.join(CHANGED_QB_TEAMS)}",
        "",
    ]
    by_key: dict[str, list[SweepRow]] = {}
    for r in rows:
        by_key.setdefault(r.key, []).append(r)
    for key, grid_rows in by_key.items():
        lines.append(f"{key}  old={old[key]:g}  new={winners[key]:g}")
        for r in grid_rows:
            mark = " *" if r.k == winners[key] else "  "
            lines.append(f"  {r.k:7g}{mark} {r.score:.5f}")
        lines.append("")
    return "\n".join(lines)


if __name__ == "__main__":
    old, winners, rows = sweep()
    print(format_report(old, winners, rows))
