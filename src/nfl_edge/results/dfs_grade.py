"""Grade DFS lineups against actual DK points once player_stats_weekly exists for the week.

Skips with "scores unpublished" when the week has no weekly rows. Mass lineups get
`actual_fpts` saved on model.dfs_lineups; any slot without an actual (skill player or DST)
leaves it null and counts the lineup as incomplete.

DST actuals come from raw.team_stats_weekly through scoring.score_dst. Points allowed is the
opponent's score minus 6 per opponent defensive/special-teams TD and 2 per opponent safety:
DraftKings does not charge those points to the DST. 2-pt/XP return points are not scored.
"""
from __future__ import annotations

from typing import Any

import numpy as np
import polars as pl

from ..config import load_yaml
from ..db import read_sql, update_from
from ..sim import scoring
from .actuals import offense_from_weekly, score_weekly

CONSTRUCTION = "mass"
DST_SUFFIX = "_DST"
OPP_NON_OFFENSE_TD_PTS = 6.0
OPP_SAFETY_PTS = 2.0


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


def lineup_total(points: list[float | None]) -> float | None:
    """Sum slot points. None when any slot has no actual."""
    total = 0.0
    for p in points:
        if p is None:
            return None
        total += float(p)
    return total


def _n(stats: dict | None, key: str) -> float:
    v = (stats or {}).get(key)
    return 0.0 if v is None else float(v)


def dst_line(own: dict, opp: dict, opp_points: float) -> dict[str, float]:
    """score_dst inputs for one team-game from nflverse team stats."""
    opp_non_offense = (
        OPP_NON_OFFENSE_TD_PTS * (_n(opp, "def_tds") + _n(opp, "special_teams_tds"))
        + OPP_SAFETY_PTS * _n(opp, "def_safeties")
    )
    return {
        "pts_allowed": max(float(opp_points) - opp_non_offense, 0.0),
        "sacks": _n(own, "def_sacks"),
        "int": _n(own, "def_interceptions"),
        "fum_rec": _n(own, "fumble_recovery_opp"),
        "td": _n(own, "def_tds") + _n(own, "special_teams_tds"),
        "safety": _n(own, "def_safeties"),
        "block_kick": _n(own, "def_fg_blocks") + _n(own, "def_pat_blocks") + _n(own, "def_punt_blocks"),
    }


def dst_points(line: dict[str, float], rules: dict) -> float:
    arr = {k: np.array([v], dtype=float) for k, v in line.items()}
    return float(scoring.score_dst(arr, rules)[0])


def dst_actuals(team_rows: list[dict], scores: list[dict], rules: dict) -> dict[str, float]:
    """DK DST points by team code. A team is absent when its row, its opponent's row or the
    opponent's final score is missing."""
    by_team = {r["team"]: r for r in team_rows if r.get("team")}
    points: dict[str, float] = {}
    for g in scores:
        if g.get("home_score") is None or g.get("away_score") is None:
            continue
        points[g["home_team"]] = float(g["home_score"])
        points[g["away_team"]] = float(g["away_score"])
    out: dict[str, float] = {}
    for team, row in by_team.items():
        opp_code = row.get("opponent_team")
        opp = by_team.get(opp_code)
        if opp is None or opp_code not in points:
            continue
        line = dst_line(row.get("stats") or {}, opp.get("stats") or {}, points[opp_code])
        out[team] = dst_points(line, rules)
    return out


def slot_points(player_id: str | None, weekly: dict[str, dict], dst_by_team: dict[str, float],
                rules: dict) -> float | None:
    """DK actual for one slot, or None when the player (or DST) has no actual."""
    if not player_id:
        return None
    pid = str(player_id)
    if pid.endswith(DST_SUFFIX):
        return dst_by_team.get(pid[: -len(DST_SUFFIX)])
    stats = weekly.get(pid)
    if stats is None:
        return None
    return score_weekly(stats, rules)["dk"]


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


def _dst_by_team(season: int, week: int, rules: dict) -> dict[str, float]:
    teams = read_sql(
        "select team, opponent_team, stats from raw.team_stats_weekly "
        "where season = %s and week = %s",
        (season, week),
    ).to_dicts()
    scores = read_sql(
        "select home_team, away_team, home_score, away_score from raw.schedules "
        "where season = %s and week = %s",
        (season, week),
    ).to_dicts()
    return dst_actuals(teams, scores, rules)


def _player_id_for_slot(slot: dict, by_dk: dict[str, str]) -> str | None:
    did = slot.get("dk_id")
    if did and did in by_dk:
        return by_dk[did]
    return slot.get("player_id")


def persist(graded: list[dict[str, Any]]) -> int:
    """Write actual_fpts (null included) onto model.dfs_lineups by row id."""
    rows = [{"id": g["id"], "actual_fpts": g["actual_fpts"]} for g in graded]
    if not rows:
        return 0
    df = pl.DataFrame(rows, schema={"id": pl.Int64, "actual_fpts": pl.Float64})
    return update_from(df, "model.dfs_lineups", ["id"])


def run(season: int, week: int, run_id: str | None = None) -> dict:
    """Grade this week's mass dfs_lineups. Skip when player_stats_weekly has no rows."""
    n = _weekly_count(season, week)
    if not scores_published(n):
        return skip_unpublished(season, week)
    rules = load_yaml("scoring.yaml")
    weekly = _stats_by_player(season, week)
    dst_by_team = _dst_by_team(season, week, rules)
    if run_id:
        lineups = read_sql(
            "select id, lineup_id, slate_id, site, sim_win_pct::float8 as sim_win_pct, "
            "proj_fpts::float8 as proj_fpts, lineup "
            "from model.dfs_lineups where run_id = %s and construction = %s",
            (run_id, CONSTRUCTION),
        )
        salaries = read_sql(
            "select player_dk_id, player_id from raw.dk_salaries "
            "where slate_id in (select distinct slate_id from model.dfs_lineups where run_id = %s)",
            (run_id,),
        )
    else:
        lineups = read_sql(
            """
            select l.id, l.lineup_id, l.slate_id, l.site, l.sim_win_pct::float8 as sim_win_pct,
                   l.proj_fpts::float8 as proj_fpts, l.lineup
            from model.dfs_lineups l
            join model.sim_runs r on r.run_id = l.run_id
            where r.season = %s and r.week = %s and l.construction = %s
            """,
            (season, week, CONSTRUCTION),
        )
        salaries = read_sql(
            "select player_dk_id, player_id from raw.dk_salaries "
            "where slate_id like %s",
            (f"{season}_{week:02d}_%",),
        )
    by_dk = {str(r["player_dk_id"]): r["player_id"] for r in salaries.to_dicts()
             if r.get("player_dk_id") and r.get("player_id")}
    graded: list[dict[str, Any]] = []
    missing: dict[str, int] = {}
    for row in lineups.to_dicts():
        slots = (row.get("lineup") or {}).get("players") or []
        points: list[float | None] = []
        for slot in slots:
            pid = _player_id_for_slot(slot, by_dk)
            pts = slot_points(pid, weekly, dst_by_team, rules)
            if pts is None:
                label = str(slot.get("name") or pid or slot.get("dk_id") or "unknown")
                missing[label] = missing.get(label, 0) + 1
            points.append(pts)
        actual = lineup_total(points) if points else None
        graded.append({
            "id": row.get("id"),
            "lineup_id": row.get("lineup_id"),
            "slate_id": row.get("slate_id"),
            "site": row.get("site"),
            "sim_win_pct": row.get("sim_win_pct"),
            "proj_fpts": row.get("proj_fpts"),
            "actual_fpts": actual,
        })
    written = persist(graded)
    incomplete = sum(1 for g in graded if g["actual_fpts"] is None)
    return {
        "skipped": False,
        "reason": None,
        "season": season,
        "week": week,
        "n_lineups": len(graded),
        "n_complete": len(graded) - incomplete,
        "n_incomplete": incomplete,
        "missing": dict(sorted(missing.items(), key=lambda kv: -kv[1])),
        "written": written,
        "lineups": graded,
    }


__all__ = [
    "dst_actuals", "dst_line", "dst_points", "lineup_dk_points", "lineup_total",
    "offense_from_weekly", "persist", "run", "scores_published", "skip_unpublished",
    "slot_points",
]
