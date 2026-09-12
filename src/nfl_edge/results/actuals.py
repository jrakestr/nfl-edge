"""Map nflverse player_stats_weekly jsonb onto scoring.OFF_KEYS and score with score_offense.

INT is passing_interceptions (the interceptions key is absent in stored jsonb).
fum_lost = rushing + receiving + sack fumbles lost.
two_pt = passing + rushing + receiving 2-pt conversions.

Return and fumble-recovery TDs are added here after score_offense, not in the sim.
We do not model return opportunity in draws; inventing one would be worse than omitting
it. Actuals are what happened, so DK/FD/PPR here include 6 × (special_teams_tds +
fumble_recovery_tds). Do not "fix" sim/scoring.py to match this path.
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
RETURN_TD_KEYS = ("special_teams_tds", "fumble_recovery_tds")
RETURN_TD_PTS = 6.0


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


def return_td_points(stats: dict | None) -> float:
    raw = stats or {}
    return RETURN_TD_PTS * sum(_num(raw, k) for k in RETURN_TD_KEYS)


def score_weekly(stats: dict | None, rules: dict) -> dict[str, float]:
    mapped = offense_from_weekly(stats)
    arr = {k: np.array([v], dtype=float) for k, v in mapped.items()}
    scored = scoring.score_offense(arr, rules)
    extra = return_td_points(stats)
    return {site: float(scored[site][0]) + extra for site in ("dk", "fd", "ppr")}


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


PPR_OUTSIDE_LIMIT = 25


def ppr_gate_ok(report: dict) -> bool:
    return int(report.get("outside") or 0) <= PPR_OUTSIDE_LIMIT


def actual_rows(weekly: list[dict[str, Any]], rules: dict) -> list[dict]:
    """REG skill rows only. had_opportunity is attempts+carries+targets >= 1."""
    out: list[dict] = []
    for row in weekly:
        stats = row.get("stats") or {}
        if not is_skill(row.get("position")) or not is_regular(stats):
            continue
        pts = score_weekly(stats, rules)
        out.append({
            "season": int(row["season"]),
            "week": int(row["week"]),
            "player_id": row["player_id"],
            "season_type": REG,
            "team": row.get("team"),
            "position": row.get("position"),
            "opponent": row.get("opponent_team"),
            "fpts_dk": pts["dk"],
            "fpts_fd": pts["fd"],
            "fpts_ppr": pts["ppr"],
            "had_opportunity": had_opportunity(stats),
        })
    return out


def load_weekly(season: int) -> list[dict]:
    from ..db import read_sql

    df = read_sql(
        "select season, week, player_id, player_name, position, team, opponent_team, stats "
        "from raw.player_stats_weekly where season = %s",
        (season,),
    )
    return df.to_dicts()


def season_types(weekly: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in weekly:
        key = str((row.get("stats") or {}).get("season_type") or "")
        counts[key] = counts.get(key, 0) + 1
    return counts


ACTUALS_KEY = ["season", "week", "player_id", "season_type"]


def persist(season: int) -> dict:
    """Score REG skill rows for a season. Refuse the write if PPR does not tie out."""
    import polars as pl

    from ..config import load_yaml
    from ..db import upsert

    rules = load_yaml("scoring.yaml")
    weekly = load_weekly(season)
    types = season_types(weekly)
    report = reconcile_ppr(weekly, rules)
    if not ppr_gate_ok(report):
        return {
            "season": season,
            "written": 0,
            "season_types": types,
            "reconcile": report,
            "blocked": True,
        }
    rows = actual_rows(weekly, rules)
    n = 0
    if rows:
        n = upsert(pl.DataFrame(rows), "model.player_fpts_actual", ACTUALS_KEY)
    return {
        "season": season,
        "written": n,
        "season_types": types,
        "reconcile": report,
        "blocked": False,
        "opportunity": sum(1 for r in rows if r["had_opportunity"]),
    }
