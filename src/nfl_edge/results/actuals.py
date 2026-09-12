"""Map nflverse player_stats_weekly jsonb onto scoring.OFF_KEYS and score with score_offense.

INT is passing_interceptions (the interceptions key is absent in stored jsonb).
fum_lost = rushing + receiving + sack fumbles lost.
two_pt = passing + rushing + receiving 2-pt conversions.
"""
from __future__ import annotations

from typing import Any

import numpy as np

from ..sim import scoring

SKILL_POSITIONS = frozenset({"QB", "RB", "WR", "TE", "FB"})
REG = "REG"

WEEKLY_TO_OFF = {
    "passing_yards": "pass_yds",
    "passing_tds": "pass_td",
    "passing_interceptions": "int",
    "rushing_yards": "rush_yds",
    "rushing_tds": "rush_td",
    "receptions": "rec",
    "receiving_yards": "rec_yds",
    "receiving_tds": "rec_td",
}
FUM_LOST_KEYS = ("rushing_fumbles_lost", "receiving_fumbles_lost", "sack_fumbles_lost")
TWO_PT_KEYS = (
    "passing_2pt_conversions",
    "rushing_2pt_conversions",
    "receiving_2pt_conversions",
)
OPP_KEYS = ("attempts", "carries", "targets")


def _num(raw: dict, key: str) -> float:
    v = raw.get(key)
    if v is None:
        return 0.0
    return float(v)


def offense_from_weekly(stats: dict | None) -> dict[str, float]:
    """Map nflverse player_stats_weekly jsonb keys onto scoring.score_offense keys."""
    raw = stats or {}
    out = {k: 0.0 for k in scoring.OFF_KEYS}
    for src, dst in WEEKLY_TO_OFF.items():
        v = raw.get(src)
        if v is not None:
            out[dst] = float(v)
    out["fum_lost"] = sum(_num(raw, k) for k in FUM_LOST_KEYS)
    out["two_pt"] = sum(_num(raw, k) for k in TWO_PT_KEYS)
    return out


def score_weekly(stats: dict | None, rules: dict) -> dict[str, float]:
    mapped = offense_from_weekly(stats)
    arr = {k: np.array([v], dtype=float) for k, v in mapped.items()}
    scored = scoring.score_offense(arr, rules)
    return {site: float(scored[site][0]) for site in ("dk", "fd", "ppr")}


def is_regular(stats: dict | None) -> bool:
    return (stats or {}).get("season_type") == REG


def had_opportunity(stats: dict | None) -> bool:
    return sum(_num(stats or {}, k) for k in OPP_KEYS) >= 1


def is_skill(position: str | None) -> bool:
    return position in SKILL_POSITIONS


def reconcile_ppr(rows: list[dict[str, Any]], rules: dict, tol: float = 0.1) -> dict:
    """Compare our PPR to nflverse fantasy_points_ppr on REG skill rows."""
    within = 0
    outside_rows: list[dict] = []
    for row in rows:
        stats = row.get("stats") or {}
        if not is_skill(row.get("position")) or not is_regular(stats):
            continue
        raw_ppr = stats.get("fantasy_points_ppr")
        if raw_ppr is None:
            continue
        ours = score_weekly(stats, rules)["ppr"]
        theirs = float(raw_ppr)
        rec = {
            "player_id": row.get("player_id"),
            "player_name": row.get("player_name"),
            "position": row.get("position"),
            "week": row.get("week"),
            "ours": ours,
            "theirs": theirs,
            "diff": ours - theirs,
            "mapped": offense_from_weekly(stats),
            "special_teams_tds": stats.get("special_teams_tds"),
            "fumble_recovery_tds": stats.get("fumble_recovery_tds"),
            "fumbles_lost_total": stats.get("fumbles_lost_total"),
        }
        if abs(rec["diff"]) <= tol:
            within += 1
        else:
            outside_rows.append(rec)
    outside_rows.sort(key=lambda r: abs(r["diff"]), reverse=True)
    return {"within": within, "outside": len(outside_rows), "worst": outside_rows[:10]}
