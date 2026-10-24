"""DFS Lineup Audit runner (`nfl-edge research audit`).

Evaluates the player pool for `(season, week, slate)` against `AUDIT_QUESTIONS` using Jev:
  - Builds as-of player states (`audit_state.py`), strictly cut off at `min(as_of, kickoff)`.
  - Checks `model.jev_judgments` by `(state_hash, question_hash, player_id)` so already-evaluated
    player states cost $0 and make zero API calls.
  - Marks players with no pre-cutoff news or injury report row as `no_read` (zero API calls).
  - Enforces `--max-usd` (default $0.10) before making any API call.
  - Appends raw judgments to `model.jev_judgments` (`insert_ignore`).
  - Evaluates player verdicts (`KEEP`, `FLAG`, `VETO`, `NO_READ`) deterministically in code.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import polars as pl

from ..db import insert_ignore, read_sql
from . import audit_state as S
from .audit_questions import (
    AUDIT_QUESTIONS,
    PINNED_JEV_MODEL,
    THRESHOLDS,
    AuditQuestionSpec,
    evaluate_player_verdict,
    question_hash,
)
from .jev_client import (
    JEV_MAX_RUN_USD,
    JEV_USD_PER_INPUT_TOKEN,
    JevAuditError,
    JevClient,
    estimate_audit_cost,
)

JUDGMENTS_SCHEMA = {
    "season": pl.Int64,
    "week": pl.Int64,
    "slate": pl.Utf8,
    "player_id": pl.Utf8,
    "question_id": pl.Utf8,
    "question_hash": pl.Utf8,
    "state_hash": pl.Utf8,
    "model_requested": pl.Utf8,
    "model_resolved": pl.Utf8,
    "kind": pl.Utf8,
    "value": pl.Float64,
    "confidence": pl.Float64,
    "probabilities": pl.Utf8,
    "news_asof": pl.Datetime(time_zone="UTC"),
    "input_tokens": pl.Int64,
    "created_at": pl.Datetime(time_zone="UTC"),
}


def load_cached_judgments(
    state_hashes: list[str],
    q_hashes: dict[str, str],
) -> dict[tuple[str, str], dict[str, dict[str, Any]]]:
    """Return `(player_id, state_hash) -> {question_id: judgment_dict}` from `model.jev_judgments`."""
    if not state_hashes:
        return {}
    rows = read_sql(
        """
        select player_id, state_hash, question_id, question_hash, model_requested, model_resolved,
               kind, value::float8 as value, confidence::float8 as confidence, probabilities
        from model.jev_judgments
        where state_hash = any(%s::text[])
        order by created_at desc
        """,
        (list(set(state_hashes)),),
    ).to_dicts()
    out: dict[tuple[str, str], dict[str, dict[str, Any]]] = {}
    for r in rows:
        qid = r["question_id"]
        if q_hashes.get(qid) != r["question_hash"]:
            continue
        key = (r["player_id"], r["state_hash"])
        bucket = out.setdefault(key, {})
        if qid not in bucket:
            bucket[qid] = {
                "kind": r["kind"],
                "value": r["value"],
                "confidence": r["confidence"],
                "probabilities": r["probabilities"],
                "model_resolved": r["model_resolved"],
            }
    return out


def run_audit(
    season: int,
    week: int,
    slate: str = "main",
    site: str = "dk",
    limit: int = 60,
    max_usd: float = JEV_MAX_RUN_USD,
    dry_run: bool = False,
    as_of: datetime | None = None,
    model: str = PINNED_JEV_MODEL,
    client: JevClient | None = None,
    specs: tuple[AuditQuestionSpec, ...] = AUDIT_QUESTIONS,
) -> dict[str, Any]:
    """Plan and execute a slate-level Jev audit. Fails closed if cost > `max_usd` or pool is empty."""
    pool = S.load_slate_audit_inputs(season, week, slate=slate, site=site, as_of=as_of)
    if not pool:
        raise JevAuditError(
            f"No salary or schedule rows found for {season} week {week} slate '{slate}'."
        )
    selected = pool[:limit]
    q_hashes = {q.id: question_hash(q) for q in specs}
    cached_map = load_cached_judgments([p["state_hash"] for p in selected], q_hashes)

    to_call: list[dict[str, Any]] = []
    cached_players: list[dict[str, Any]] = []
    no_read_players: list[dict[str, Any]] = []

    for item in selected:
        pid = item["target"].player_id
        sh = item["state_hash"]
        existing = cached_map.get((pid, sh), {})
        if not item["has_text_state"]:
            no_read_players.append(item)
        elif all(q.id in existing for q in specs):
            cached_players.append(item)
        else:
            to_call.append(item)

    est = estimate_audit_cost(
        [x["state"] for x in to_call],
        questions=specs,
        total_players=len(selected),
        cached_players=len(cached_players),
        no_read_players=len(no_read_players),
    )
    if est.est_usd > max_usd:
        raise JevAuditError(
            f"Estimated cost ${est.est_usd:.4f} exceeds max_usd=${max_usd:.4f}; aborting before API calls."
        )

    now = datetime.now(UTC)
    new_rows: list[dict[str, Any]] = []
    actual_tokens = 0
    resolved_models: set[str] = set()

    if not dry_run:
        for item in no_read_players:
            pid = item["target"].player_id
            sh = item["state_hash"]
            if (pid, sh) in cached_map:
                continue
            new_rows.append({
                "season": season,
                "week": week,
                "slate": slate,
                "player_id": pid,
                "question_id": "no_read",
                "question_hash": "no_read",
                "state_hash": sh,
                "model_requested": model,
                "model_resolved": "no_read",
                "kind": "no_read",
                "value": None,
                "confidence": None,
                "probabilities": None,
                "news_asof": item["news_asof"],
                "input_tokens": 0,
                "created_at": now,
            })

        if to_call:
            jev = client or JevClient(model=model)
            for item in to_call:
                pid = item["target"].player_id
                sh = item["state_hash"]
                resp = jev.evaluate_player(item["state"], specs=specs)
                actual_tokens += resp.input_tokens
                resolved_models.add(resp.model_resolved)
                cached_map[(pid, sh)] = resp.answers
                for q in specs:
                    ans = resp.answers[q.id]
                    new_rows.append({
                        "season": season,
                        "week": week,
                        "slate": slate,
                        "player_id": pid,
                        "question_id": q.id,
                        "question_hash": q_hashes[q.id],
                        "state_hash": sh,
                        "model_requested": resp.model_requested,
                        "model_resolved": resp.model_resolved,
                        "kind": ans["kind"],
                        "value": ans["value"],
                        "confidence": ans["confidence"],
                        "probabilities": (
                            json.dumps(ans["probabilities"], sort_keys=True)
                            if ans.get("probabilities") is not None
                            else None
                        ),
                        "news_asof": item["news_asof"],
                        "input_tokens": resp.input_tokens,
                        "created_at": now,
                    })

    written = 0
    if new_rows and not dry_run:
        df = pl.DataFrame(new_rows, schema=JUDGMENTS_SCHEMA)
        written = insert_ignore(df, "model.jev_judgments")

    player_summaries: list[dict[str, Any]] = []
    counts = {"KEEP": 0, "FLAG": 0, "VETO": 0, "NO_READ": 0}
    for item in selected:
        t = item["target"]
        j_map = cached_map.get((t.player_id, item["state_hash"]), {})
        ev = evaluate_player_verdict(j_map, THRESHOLDS)
        counts[ev.verdict] = counts.get(ev.verdict, 0) + 1
        player_summaries.append({
            "player_id": t.player_id,
            "name": t.name,
            "team": t.team,
            "position": t.position,
            "salary": t.salary,
            "proj_dk_mean": t.proj_dk_mean,
            "in_lineup": item["in_lineup"],
            "verdict": ev.verdict,
            "reasons": ev.reasons,
            "boost": ev.boost_signal,
            "state_hash": item["state_hash"],
        })

    return {
        "season": season,
        "week": week,
        "slate": slate,
        "dry_run": dry_run,
        "estimate": est,
        "actual_input_tokens": actual_tokens,
        "actual_usd": actual_tokens * JEV_USD_PER_INPUT_TOKEN,
        "model_requested": model,
        "models_resolved": sorted(resolved_models),
        "written_rows": written,
        "verdict_counts": counts,
        "players": player_summaries,
    }
