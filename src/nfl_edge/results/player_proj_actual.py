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
        "games_without_run": no_run,
        "with_parquet": sum(1 for r in rows if r["proj_dk_p50"] is not None),
        "runs": sorted(set(chosen.values())),
    }


def refresh_week(season: int, week: int) -> dict:
    """Score actuals (idempotent), then build the week's table. Same path grade uses."""
    from . import actuals as A

    scored = A.persist(season)
    if scored.get("blocked"):
        return skip(season, week, "player actuals blocked: PPR does not tie out; table not written")
    return build_week(season, week)


# ----------------------------------------------------------------------------- bias cells
NOT_ENOUGH = "not enough evidence"
CANDIDATE = "candidate"


def gate(weekly_means: dict[int, float], n: int, mean: float | None,
         se: float | None) -> tuple[str, str]:
    """Consistency gate. A candidate needs n >= MIN_N, >= 2 graded weeks, the same residual
    sign in every week, and |mean residual| above one standard error."""
    if n < MIN_N:
        return NOT_ENOUGH, f"only {n} players, need {MIN_N}"
    if len(weekly_means) < 2:
        return NOT_ENOUGH, f"only {len(weekly_means)} graded week, need at least 2"
    signs = {(v > 0) - (v < 0) for v in weekly_means.values()}
    if len(signs) != 1 or 0 in signs:
        return NOT_ENOUGH, "residual sign differs between weeks"
    if mean is None or se is None or abs(mean) <= se:
        return NOT_ENOUGH, "difference is within one standard error"
    return CANDIDATE, "same sign every week, beyond one standard error"


def _se(values: list[float]) -> float | None:
    n = len(values)
    if n < 2:
        return None
    mean = sum(values) / n
    var = sum((v - mean) ** 2 for v in values) / (n - 1)
    return (var / n) ** 0.5


def _empty_cell(dimension: str, label: str) -> dict:
    return {
        "dimension": dimension, "label": label, "n": 0, "projected": None, "actual": None,
        "mean_resid": None, "mean_pct": None, "mae": None, "se": None, "weeks": {},
        "state": NOT_ENOUGH, "reason": "no players",
    }


def bias_cell(dimension: str, label: str, by_week: dict[int, list[tuple[float, float]]]) -> dict:
    """by_week: week -> [(actual, projected)]. Residual is actual - projected."""
    pairs = [p for w in by_week.values() for p in w]
    if not pairs:
        return _empty_cell(dimension, label)
    resid = [residual(a, p) for a, p in pairs]
    n = len(pairs)
    sum_proj = sum(p for _, p in pairs)
    weeks = {w: sum(residual(a, p) for a, p in v) / len(v) for w, v in by_week.items() if v}
    mean, se = sum(resid) / n, _se(resid)
    state, reason = gate(weeks, n, mean, se)
    return {
        "dimension": dimension, "label": label, "n": n,
        "projected": sum_proj / n, "actual": sum(a for a, _ in pairs) / n,
        "mean_resid": mean, "mean_pct": (100.0 * sum(resid) / sum_proj) if sum_proj else None,
        "mae": sum(abs(r) for r in resid) / n, "se": se, "weeks": weeks,
        "state": state, "reason": reason,
    }


def ratio_cell(dimension: str, label: str,
               by_week: dict[int, list[tuple[float, float, float, float]]]) -> dict:
    """Yards per touch as ratio of sums. Rows are (act_yds, act_touches, proj_yds, proj_touches).
    The SE is the ratio estimator's on the actual side; projected is a deterministic mean."""
    rows = [r for w in by_week.values() for r in w]
    sx, sy = sum(r[1] for r in rows), sum(r[0] for r in rows)
    px, py = sum(r[3] for r in rows), sum(r[2] for r in rows)
    if not rows or sx <= 0 or px <= 0:
        return _empty_cell(dimension, label)
    actual, projected = sy / sx, py / px
    n = len(rows)
    se = None
    if n > 1:
        se = ((n / (n - 1)) * sum((r[0] - actual * r[1]) ** 2 for r in rows)) ** 0.5 / sx
    weeks: dict[int, float] = {}
    for w, v in by_week.items():
        wx, wpx = sum(r[1] for r in v), sum(r[3] for r in v)
        if wx > 0 and wpx > 0:
            weeks[w] = sum(r[0] for r in v) / wx - sum(r[2] for r in v) / wpx
    mean = actual - projected
    state, reason = gate(weeks, n, mean, se)
    return {
        "dimension": dimension, "label": label, "n": n, "projected": projected,
        "actual": actual, "mean_resid": mean, "mean_pct": 100.0 * mean / projected,
        "mae": None, "se": se, "weeks": weeks, "state": state, "reason": reason,
    }


# Which existing prior channel a candidate would go through. Informational only.
OWNER_BY_DIMENSION = {
    "targets": "usage shrink (target share)",
    "carries": "usage shrink (carry share)",
    "attempts": "QB replacement baseline",
    "yards per touch": "efficiency shrink and recency weights",
}
OWNER_DEFAULT = "usage shrink or recency weights; read the channel cells to see which"


def owner_for(cell: dict) -> str:
    if cell["dimension"] in OWNER_BY_DIMENSION:
        return OWNER_BY_DIMENSION[cell["dimension"]]
    if cell["label"].startswith("QB"):
        return "QB replacement baseline, then usage shrink"
    return OWNER_DEFAULT


def _active(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r.get("had_opportunity") and r.get("actual_dk") is not None
            and r.get("proj_dk_mean") is not None]


def _by_week(rows: list[dict], pair) -> dict[int, list]:
    out: dict[int, list] = {}
    for r in rows:
        v = pair(r)
        if v is not None:
            out.setdefault(int(r["week"]), []).append(v)
    return out


def _dk(r: dict):
    return (float(r["actual_dk"]), float(r["proj_dk_mean"]))


def _count(actual: str, proj: str):
    def f(r: dict):
        a, p = r.get(actual), r.get(proj)
        return None if a is None or p is None else (float(a), float(p))
    return f


def _ypt(ay: str, at: str, py: str, pt: str):
    def f(r: dict):
        vals = [r.get(k) for k in (ay, at, py, pt)]
        return None if any(v is None for v in vals) else tuple(float(v) for v in vals)
    return f


COUNT_CHANNELS = (
    ("targets", ("RB", "WR", "TE"), "actual_targets", "proj_targets"),
    ("carries", ("QB", "RB"), "actual_carries", "proj_carries"),
    ("attempts", ("QB",), "actual_pass_att", "proj_pass_att"),
)
YPT_CHANNELS = (
    ("receiving yards per target", ("RB", "WR", "TE"),
     ("actual_rec_yds", "actual_targets", "proj_rec_yds", "proj_targets")),
    ("rushing yards per carry", ("QB", "RB"),
     ("actual_rush_yds", "actual_carries", "proj_rush_yds", "proj_carries")),
    ("passing yards per attempt", ("QB",),
     ("actual_pass_yds", "actual_pass_att", "proj_pass_yds", "proj_pass_att")),
)


def report(rows: list[dict]) -> dict:
    """Bias cells by position, tier, position and tier, and usage channel, plus the gate."""
    active = _active(rows)
    cells: list[dict] = []
    for pos in POSITIONS:
        cells.append(bias_cell("position", pos, _by_week(
            [r for r in active if r["position"] == pos], _dk)))
    for tier in ("star", "rest"):
        cells.append(bias_cell("tier", tier, _by_week(
            [r for r in active if r["tier"] == tier], _dk)))
    for pos in POSITIONS:
        for tier in ("star", "rest"):
            cells.append(bias_cell("position and tier", f"{pos} {tier}", _by_week(
                [r for r in active if r["position"] == pos and r["tier"] == tier], _dk)))
    for dim, positions, a, p in COUNT_CHANNELS:
        for pos in positions:
            cells.append(bias_cell(dim, pos, _by_week(
                [r for r in active if r["position"] == pos], _count(a, p))))
    for name, positions, keys in YPT_CHANNELS:
        for pos in positions:
            cells.append(ratio_cell("yards per touch", f"{pos} {name}", _by_week(
                [r for r in active if r["position"] == pos], _ypt(*keys))))
    candidates = [{**c, "owner": owner_for(c)} for c in cells if c["state"] == CANDIDATE]
    return {
        "cells": cells, "candidates": candidates,
        "did_not_play": sum(1 for r in rows if not r.get("had_opportunity")),
        "n_players": len(active), "weeks": sorted({int(r["week"]) for r in rows}),
    }


# ----------------------------------------------------------------------------- report output
def load_rows(season: int) -> list[dict]:
    df = read_sql(
        "select season, week, player_id, position, tier, had_opportunity, proj_dk_mean, "
        "proj_dk_p50, actual_dk, residual_dk, proj_targets, proj_carries, proj_pass_att, "
        "proj_pass_yds, proj_rush_yds, proj_rec_yds, actual_targets, actual_carries, "
        "actual_pass_att, actual_pass_yds, actual_rush_yds, actual_rec_yds "
        "from model.player_proj_actual where season = %s",
        (season,),
    )
    return [] if df.is_empty() else df.to_dicts()


def _fmt(v: float | None, spec: str = "+.2f") -> str:
    return "\u2014" if v is None else format(v, spec)


def report_markdown(season: int, rep: dict) -> str:
    weeks = ", ".join(str(w) for w in rep["weeks"]) or "none"
    lines = [
        f"# Player projections vs actual, {season}",
        "",
        "Residual is actual minus projected DK points; positive means we underproject.",
        (f"Graded weeks: {weeks}. Players compared: {rep['n_players']}. "
         f"Projected but did not play (excluded): {rep['did_not_play']}."),
        ("Diagnostic only. A candidate is eligible for a separate, backtested prior change; "
         "nothing here changes priors."),
        (f"Gate: at least {MIN_N} players, at least 2 graded weeks, same residual sign every "
         "week, difference beyond one standard error."),
        "",
    ]
    dims = list(dict.fromkeys(c["dimension"] for c in rep["cells"]))
    for dim in dims:
        lines += [f"## {dim.capitalize()}", "",
                  "| Cell | Players | Projected | Actual | Residual | Residual % | MAE | Std error | State |",
                  "|---|---|---|---|---|---|---|---|---|"]
        for c in (c for c in rep["cells"] if c["dimension"] == dim):
            state = c["state"] if c["state"] == CANDIDATE else f"{c['state']} ({c['reason']})"
            lines.append(
                f"| {c['label']} | {c['n']} | {_fmt(c['projected'], '.2f')} | "
                f"{_fmt(c['actual'], '.2f')} | {_fmt(c['mean_resid'])} | "
                f"{_fmt(c['mean_pct'], '+.1f')} | {_fmt(c['mae'], '.2f')} | "
                f"{_fmt(c['se'], '.2f')} | {state} |")
        lines.append("")
    lines += ["## Candidates for a prior change", ""]
    if not rep["candidates"]:
        lines.append("None. No cell passes the gate.")
    for c in rep["candidates"]:
        lines.append(f"- {c['dimension']} / {c['label']}: residual {_fmt(c['mean_resid'])} "
                     f"({c['n']} players); would go through {c['owner']}")
    return "\n".join(lines) + "\n"


def write_report(season: int) -> tuple[str, dict]:
    rep = report(load_rows(season))
    path = ROOT / "output" / f"player_bias_{season}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(report_markdown(season, rep))
    return str(path), rep
