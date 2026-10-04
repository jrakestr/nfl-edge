"""Projected vs actual DK points per player, from the kickoff-locked run of each game.

Diagnostic only. Nothing here reads or writes priors, sim parameters, or config; the bias
report in this module lists candidates, it does not apply them.

Residual = actual - projected, so a positive residual means we underproject.
Projection is model.proj_players on the newest run predating each game's kickoff (the rule
grade.run uses). DK p50 and pass attempts are not stored in Postgres; they are read from the
draw parquet at grade time and are null once that parquet is pruned.
"""
from __future__ import annotations

import json
from datetime import datetime
from zoneinfo import ZoneInfo

import polars as pl

from ..config import ROOT
from ..db import read_sql, upsert
from ..rebuild import games_missing_result
from .grade import kickoff_at, run_for_kickoff

ET = ZoneInfo("America/New_York")

POSITIONS = ("QB", "RB", "WR", "TE")
# Star = top N by projected DK mean within the position for the week. Fixed before looking
# at any result; do not tune against the residuals.
STAR_COUNTS = {"QB": 12, "RB": 24, "WR": 36, "TE": 12}
MIN_N = 30
KEY = ["run_id", "player_id"]
TABLE = "model.player_proj_actual"


def residual(actual: float, proj: float) -> float:
    return float(actual) - float(proj)


def _num(v) -> float | None:
    return None if v is None else float(v)


def _summary(row: dict) -> dict:
    s = row.get("stat_summary") or {}
    return json.loads(s) if isinstance(s, str) else s


def _mean_of(summary: dict, key: str) -> float | None:
    return _num((summary.get(key) or {}).get("mean"))


def _raw(stats: dict, key: str) -> float:
    v = stats.get(key)
    return 0.0 if v is None else float(v)


def assign_tiers(rows: list[dict]) -> list[dict]:
    """Add `tier` (star / rest): top STAR_COUNTS[position] by proj_dk_mean within the position."""
    by_pos: dict[str, list[dict]] = {}
    for r in rows:
        by_pos.setdefault(str(r.get("position")), []).append(r)
    star: set[int] = set()
    for pos, group in by_pos.items():
        n = STAR_COUNTS.get(pos, 0)
        ranked = sorted(group, key=lambda r: -(r.get("proj_dk_mean") or 0.0))
        star.update(id(r) for r in ranked[:n])
    return [{**r, "tier": "star" if id(r) in star else "rest"} for r in rows]


def game_runs(sched: list[dict], runs: list[dict]) -> tuple[dict[str, str], list[str]]:
    """game_id -> newest run created before kickoff; games with no such run are returned apart."""
    chosen: dict[str, str] = {}
    skipped: list[str] = []
    for s in sched:
        if s.get("result") is None:
            continue
        kick = kickoff_at(s["gameday"], s.get("gametime"), s.get("location"))
        rid = run_for_kickoff(runs, kick)
        if rid is None:
            skipped.append(str(s["game_id"]))
        else:
            chosen[str(s["game_id"])] = rid
    return chosen, skipped


def build_rows(
    season: int, week: int, proj: list[dict], actuals: dict[str, dict], weekly: dict[str, dict],
    drawstats: dict[tuple[str, str], dict], now: datetime | None = None,
) -> list[dict]:
    """One row per projected QB/RB/WR/TE. No weekly row -> had_opportunity false, actual null."""
    now = now or datetime.now(ET)
    base: list[dict] = []
    for p in proj:
        if p.get("position") not in POSITIONS:
            continue
        pid, rid = p["player_id"], str(p["run_id"])
        s = _summary(p)
        ds = drawstats.get((rid, pid)) or {}
        act = actuals.get(pid)
        stats = weekly.get(pid) or {}
        mean = _num(p.get("fpts_dk_mean"))
        actual_dk = None if act is None else _num(act.get("fpts_dk"))
        has = act is not None
        base.append({
            "run_id": rid, "player_id": pid, "season": int(season), "week": int(week),
            "game_id": p.get("game_id"), "team": p.get("team"), "position": p["position"],
            "had_opportunity": bool(act.get("had_opportunity")) if has else False,
            "proj_dk_mean": mean, "proj_dk_p50": _num(ds.get("p50_dk")),
            "actual_dk": actual_dk,
            "residual_dk": (None if actual_dk is None or mean is None
                            else residual(actual_dk, mean)),
            "proj_targets": _mean_of(s, "targets"), "proj_carries": _mean_of(s, "carries"),
            "proj_pass_att": _num(ds.get("pass_att_mean")),
            "proj_pass_yds": _mean_of(s, "pass_yds"), "proj_rush_yds": _mean_of(s, "rush_yds"),
            "proj_rec_yds": _mean_of(s, "rec_yds"),
            "actual_targets": _raw(stats, "targets") if has else None,
            "actual_carries": _raw(stats, "carries") if has else None,
            "actual_pass_att": _raw(stats, "attempts") if has else None,
            "actual_pass_yds": _raw(stats, "passing_yards") if has else None,
            "actual_rush_yds": _raw(stats, "rushing_yards") if has else None,
            "actual_rec_yds": _raw(stats, "receiving_yards") if has else None,
            "graded_at": now,
        })
    return assign_tiers(base)


# ----------------------------------------------------------------------------- I/O
def skip(season: int, week: int, reason: str) -> dict:
    return {"skipped": True, "reason": reason, "season": season, "week": week, "n_rows": 0}


def missing_finals_reason(missing: list[str]) -> str:
    return f"waiting on {len(missing)} finals ({', '.join(missing)}); nothing written"


def _draw_stats(proj: list[dict]) -> dict[tuple[str, str], dict]:
    """DK p50 and mean pass attempts from parquet where it still exists; absent otherwise."""
    paths: dict[str, set[str]] = {}
    for p in proj:
        path = p.get("draws_path")
        if path:
            paths.setdefault(str(path), set()).add(str(p["run_id"]))
    out: dict[tuple[str, str], dict] = {}
    for path, run_ids in paths.items():
        f = ROOT / path
        if not f.exists():
            continue
        df = pl.read_parquet(f, columns=["player_id", "fpts_dk", "pass_att"])
        agg = df.group_by("player_id").agg(
            pl.col("fpts_dk").median().alias("p50_dk"),
            pl.col("pass_att").mean().alias("pass_att_mean"),
        )
        for r in agg.iter_rows(named=True):
            for rid in run_ids:
                out[(rid, r["player_id"])] = {
                    "p50_dk": r["p50_dk"], "pass_att_mean": r["pass_att_mean"]}
    return out


def build_week(season: int, week: int) -> dict:
    """Write model.player_proj_actual for a fully final week. Fails closed with a reason."""
    missing = games_missing_result(season, week)
    if missing:
        return skip(season, week, missing_finals_reason(missing))
    actual = read_sql(
        "select player_id, fpts_dk::float8 as fpts_dk, had_opportunity "
        "from model.player_fpts_actual "
        "where season = %s and week = %s and season_type = 'REG'",
        (season, week),
    )
    if actual.is_empty():
        return skip(season, week, "scores unpublished; run score-actuals first")
    runs = read_sql(
        "select run_id::text as run_id, created_at from model.sim_runs "
        "where season = %s and week = %s",
        (season, week),
    )
    if runs.is_empty():
        return skip(season, week, "no sim runs for the week")
    sched = read_sql(
        "select game_id, gameday, gametime, location, result from raw.schedules "
        "where season = %s and week = %s and game_type = 'REG'",
        (season, week),
    )
    chosen, no_run = game_runs(sched.to_dicts(), runs.to_dicts())
    if not chosen:
        return skip(season, week, "no run predates kickoff for any game")
    proj_df = read_sql(
        "select run_id::text as run_id, player_id, game_id, team, position, "
        "fpts_dk_mean::float8 as fpts_dk_mean, stat_summary, draws_path "
        "from model.proj_players where run_id = any(%s::uuid[]) and position is distinct from 'DST'",
        (sorted(set(chosen.values())),),
    )
    proj = [r for r in proj_df.to_dicts() if chosen.get(str(r["game_id"])) == r["run_id"]]
    weekly_df = read_sql(
        "select player_id, stats from raw.player_stats_weekly where season = %s and week = %s",
        (season, week),
    )
    weekly = {r["player_id"]: r.get("stats") or {} for r in weekly_df.to_dicts()}
    actuals = {r["player_id"]: r for r in actual.to_dicts()}
    drawstats = _draw_stats(proj)
    rows = build_rows(season, week, proj, actuals, weekly, drawstats)
    n = upsert(pl.DataFrame(rows, infer_schema_length=None), TABLE, KEY) if rows else 0
    return {
        "skipped": False, "reason": None, "season": season, "week": week, "n_rows": n,
        "games_without_run": no_run, "with_parquet": len({k for k in drawstats}),
        "runs": sorted(set(chosen.values())),
    }
