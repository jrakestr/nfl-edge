"""Grade DFS lineups against actual DK points once player_stats_weekly exists for the week.

No-op with a clear skip when scores are unpublished (2026 week 1 today). Persistence of
actual_fpts is deferred until the first live week has stats — print-only until then.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from ..config import load_yaml
from ..db import read_sql
from ..sim import scoring
from .actuals import offense_from_weekly


def scores_published(n_weekly_rows: int) -> bool:
    return int(n_weekly_rows) > 0


def skip_unpublished(season: int, week: int) -> dict:
    return {
        "skipped": True,
        "reason": "scores unpublished",
        "season": season,
        "week": week,
        "n_lineups": 0,
        "lineups": [],
    }


def lineup_dk_points(player_stats: list[dict | None], rules: dict) -> float | None:
    """Sum DK points for a lineup. None if any skill player is missing a weekly row."""
    total = 0.0
    for s in player_stats:
        if s is None:
            return None
        arr = {k: np.array([v], dtype=float) for k, v in s.items()}
        total += float(scoring.score_offense(arr, rules)["dk"][0])
    return total


def _weekly_count(season: int, week: int) -> int:
    df = read_sql(
        "select count(*)::int as n from raw.player_stats_weekly where season = %s and week = %s",
        (season, week),
    )
    if df.is_empty():
        return 0
    return int(df[0, "n"] or 0)


def _stats_by_player(season: int, week: int) -> dict[str, dict]:
    df = read_sql(
        "select player_id, stats from raw.player_stats_weekly where season = %s and week = %s",
        (season, week),
    )
    out = {}
    for row in df.to_dicts():
        pid = row.get("player_id")
        if pid:
            out[pid] = row.get("stats") or {}
    return out


def _player_id_for_slot(slot: dict, by_dk: dict[str, str]) -> str | None:
    did = slot.get("dk_id")
    if did and did in by_dk:
        return by_dk[did]
    return slot.get("player_id")


def run(season: int, week: int, run_id: str | None = None) -> dict:
    """Grade this week's dfs_lineups. Skip when player_stats_weekly has no rows."""
    n = _weekly_count(season, week)
    if not scores_published(n):
        return skip_unpublished(season, week)
    rules = load_yaml("scoring.yaml")
    weekly = _stats_by_player(season, week)
    if run_id:
        lineups = read_sql(
            "select lineup_id, slate_id, site, sim_win_pct::float8 as sim_win_pct, "
            "proj_fpts::float8 as proj_fpts, lineup "
            "from model.dfs_lineups where run_id = %s",
            (run_id,),
        )
        salaries = read_sql(
            "select player_dk_id, player_id from raw.dk_salaries "
            "where slate_id in (select distinct slate_id from model.dfs_lineups where run_id = %s)",
            (run_id,),
        )
    else:
        lineups = read_sql(
            """
            select l.lineup_id, l.slate_id, l.site, l.sim_win_pct::float8 as sim_win_pct,
                   l.proj_fpts::float8 as proj_fpts, l.lineup
            from model.dfs_lineups l
            join model.sim_runs r on r.run_id = l.run_id
            where r.season = %s and r.week = %s
            """,
            (season, week),
        )
        salaries = read_sql(
            "select player_dk_id, player_id from raw.dk_salaries "
            "where slate_id like %s",
            (f"{season}_{week:02d}_%",),
        )
    by_dk = {str(r["player_dk_id"]): r["player_id"] for r in salaries.to_dicts()
             if r.get("player_dk_id") and r.get("player_id")}
    graded: list[dict[str, Any]] = []
    for row in lineups.to_dicts():
        players = (row.get("lineup") or {}).get("players") or []
        mapped = []
        missing = False
        for slot in players:
            pid = _player_id_for_slot(slot, by_dk)
            if pid and str(pid).endswith("_DST"):
                mapped.append(offense_from_weekly({}))  # DST actuals need team_stats; 0 until then
                continue
            if pid is None or pid not in weekly:
                missing = True
                break
            mapped.append(offense_from_weekly(weekly[pid]))
        actual = None if missing else lineup_dk_points(mapped, rules)
        graded.append({
            "lineup_id": row.get("lineup_id"),
            "slate_id": row.get("slate_id"),
            "site": row.get("site"),
            "sim_win_pct": row.get("sim_win_pct"),
            "proj_fpts": row.get("proj_fpts"),
            "actual_fpts": actual,
        })
    return {
        "skipped": False,
        "reason": None,
        "season": season,
        "week": week,
        "n_lineups": len(graded),
        "lineups": graded,
    }
