"""Forward grading for Jev qualitative lineup audit (`nfl-edge grade-jev`).

Grades only pre-kickoff audited rows (`j.created_at < game kickoff` and
`coalesce(j.news_asof, j.created_at) < game kickoff`) against realized week outcomes:
  - Actual DK points vs simulator pre-kickoff `proj_dk_mean` (`residual = actual_dk - proj_dk_mean`).
  - Realized offensive snap share (`raw.snap_counts.offense_pct`) vs prior-3-week snap share
    (`snap_drop = snap_pct_l3 - realized_snap_pct`), including DNP (`realized_snap_pct = 0.0`).
  - Aggregates by composed verdict (`VETO`, `FLAG`, `KEEP`, `NO_READ`) and by individual atomic
    question (`yes` band `p >= 0.80` vs `no` band `p <= 0.20` vs `uncertain`).
"""
from __future__ import annotations

import json
from typing import Any

from ..db import read_sql
from ..research.audit_questions import AUDIT_QUESTIONS, THRESHOLDS, evaluate_player_verdict


def compute_verdict_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pure aggregation over graded player-slate audit records."""
    buckets: dict[str, list[dict[str, Any]]] = {"VETO": [], "FLAG": [], "KEEP": [], "NO_READ": []}
    for r in rows:
        v = r.get("verdict", "NO_READ")
        buckets.setdefault(v, []).append(r)

    summary: list[dict[str, Any]] = []
    for v in ("VETO", "FLAG", "KEEP", "NO_READ"):
        items = buckets.get(v, [])
        if not items:
            continue
        n = len(items)
        resids = [float(x["residual"]) for x in items if x.get("residual") is not None]
        snaps = [float(x["realized_snap_pct"]) for x in items if x.get("realized_snap_pct") is not None]
        dnp_count = sum(1 for x in items if (x.get("realized_snap_pct") or 0.0) == 0.0)
        summary.append({
            "verdict": v,
            "players": n,
            "mean_proj_dk": (
                round(sum(float(x["proj_dk_mean"]) for x in items if x.get("proj_dk_mean") is not None) / len(resids), 2)
                if resids else None
            ),
            "mean_actual_dk": (
                round(sum(float(x["actual_dk"]) for x in items if x.get("actual_dk") is not None) / len(resids), 2)
                if resids else None
            ),
            "mean_residual_dk": round(sum(resids) / len(resids), 2) if resids else None,
            "mean_realized_snap_pct": round(sum(snaps) / len(snaps), 3) if snaps else None,
            "dnp_rate": round(dnp_count / n, 3),
        })
    return summary


def compute_question_summary(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Per-question lift: compare mean DK residual and snap share when question triggers vs clear."""
    yes_min = THRESHOLDS["noul_yes_min"]
    out: list[dict[str, Any]] = []
    for spec in AUDIT_QUESTIONS:
        triggered = []
        cleared = []
        for r in rows:
            j = (r.get("judgments") or {}).get(spec.id)
            if not j or j.get("value") is None or r.get("residual") is None:
                continue
            val = float(j["value"])
            is_trig = (val >= yes_min) if spec.kind == "noul" else (val >= 3.0)
            if is_trig:
                triggered.append(r)
            else:
                cleared.append(r)
        if not triggered and not cleared:
            continue
        out.append({
            "question_id": spec.id,
            "label": spec.label,
            "kind": spec.kind,
            "n_triggered": len(triggered),
            "trig_mean_residual": (
                round(sum(float(x["residual"]) for x in triggered) / len(triggered), 2)
                if triggered else None
            ),
            "n_cleared": len(cleared),
            "clear_mean_residual": (
                round(sum(float(x["residual"]) for x in cleared) / len(cleared), 2)
                if cleared else None
            ),
        })
    return out


def run(season: int, week: int, slate: str = "main") -> dict[str, Any]:
    """Load pre-kickoff Jev judgments for `(season, week, slate)` and grade against realized outcomes."""
    ko_expr = "(s.gameday + s.gametime::time) at time zone 'America/New_York'"
    j_rows = read_sql(
        f"""
        select j.player_id, j.state_hash, j.question_id, j.kind,
               j.value::float8 as value, j.confidence::float8 as confidence,
               j.created_at, j.news_asof,
               rf.full_name as name, rf.team, rf.position, rf.fields
        from model.jev_judgments j
        join model.research_fields rf
          on rf.season = j.season and rf.week = j.week and rf.player_id = j.player_id
        join raw.schedules s
          on s.season = j.season and s.week = j.week and s.game_id = rf.game_id
        where j.season = %s and j.week = %s and j.slate = %s
          and s.gametime is not null
          and j.created_at < {ko_expr}
          and coalesce(j.news_asof, j.created_at) < {ko_expr}
        order by j.created_at desc
        """,
        (season, week, slate),
    ).to_dicts()

    if not j_rows:
        return {
            "season": season,
            "week": week,
            "slate": slate,
            "n_players": 0,
            "verdicts": [],
            "questions": [],
            "players": [],
        }

    act_rows = read_sql(
        """
        select player_id, dk_pts::float8 as dk_pts, state
        from model.slate_actuals
        where season = %s and week = %s and state in ('final', 'dnp')
        """,
        (season, week),
    ).to_dicts()
    actual_by_pid = {r["player_id"]: float(r["dk_pts"] or 0.0) for r in act_rows}

    snap_rows = read_sql(
        """
        select p.gsis_id as player_id, sc.offense_pct::float8 as offense_pct
        from raw.snap_counts sc
        join raw.players p on p.pfr_id = sc.pfr_player_id
        where sc.season = %s and sc.week = %s and p.gsis_id is not null
        """,
        (season, week),
    ).to_dicts()
    snap_by_pid = {r["player_id"]: float(r["offense_pct"] or 0.0) for r in snap_rows}

    by_player: dict[str, dict[str, Any]] = {}
    for r in j_rows:
        pid = r["player_id"]
        if pid not in by_player:
            f = r.get("fields")
            if isinstance(f, str):
                f = json.loads(f)
            f = f if isinstance(f, dict) else {}
            by_player[pid] = {
                "player_id": pid,
                "name": r["name"],
                "team": r["team"],
                "position": r["position"],
                "state_hash": r["state_hash"],
                "proj_dk_mean": float(f["sim_dk_mean"]) if f.get("sim_dk_mean") is not None else None,
                "prior_snap_l3": float(f["snap_pct_l3"]) if f.get("snap_pct_l3") is not None else None,
                "judgments": {},
            }
        entry = by_player[pid]
        if r["state_hash"] != entry["state_hash"]:
            continue
        qid = r["question_id"]
        if qid not in entry["judgments"]:
            entry["judgments"][qid] = {
                "kind": r["kind"],
                "value": r["value"],
                "confidence": r["confidence"],
            }

    graded_players: list[dict[str, Any]] = []
    for pid, p in by_player.items():
        if pid not in actual_by_pid:
            continue
        ev = evaluate_player_verdict(p["judgments"], THRESHOLDS)
        act_dk = actual_by_pid[pid]
        proj_dk = p["proj_dk_mean"]
        resid = (act_dk - proj_dk) if proj_dk is not None else None
        real_snap = snap_by_pid.get(pid, 0.0)
        graded_players.append({
            **p,
            "verdict": ev.verdict,
            "reasons": ev.reasons,
            "actual_dk": act_dk,
            "residual": resid,
            "realized_snap_pct": real_snap,
        })

    return {
        "season": season,
        "week": week,
        "slate": slate,
        "n_players": len(graded_players),
        "verdicts": compute_verdict_summary(graded_players),
        "questions": compute_question_summary(graded_players),
        "players": graded_players,
    }
