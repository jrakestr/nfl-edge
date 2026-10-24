"""TypeSafe System One (Jev) client wrapper for DFS Lineup Audit.

Uses `typesafe-sdk` with speculative fan-out: one `system_one(state, questions)` call per player
evaluating all independent atomic questions in a single pass.
  - Pricing: $0.042 per 1M input tokens (output tokens are free).
  - Hard cost cap: $0.10 per audit run by default (`JEV_MAX_RUN_USD`).
  - Logs both `model_requested` and `model_resolved` (`response.model`).
  - Never prints or logs the API key.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from typesafe_sdk import Noul, Score, TypeSafeClient, TypeSafeError

from ..config import typesafe_api_key
from .audit_questions import AUDIT_QUESTIONS, PINNED_JEV_MODEL, AuditQuestionSpec

JEV_USD_PER_INPUT_TOKEN = 0.042 / 1_000_000
JEV_MAX_RUN_USD = 0.10
OVERHEAD_TOKENS_PER_PLAYER = 320


class JevAuditError(RuntimeError):
    """Plain-language failure before or during a Jev audit run."""


@dataclass(frozen=True)
class CostEstimate:
    players_total: int
    players_cached: int
    players_no_read: int
    players_to_call: int
    est_input_tokens: int
    est_usd: float


def estimate_audit_cost(
    states_to_call: list[dict[str, Any]],
    questions: tuple[AuditQuestionSpec, ...] = AUDIT_QUESTIONS,
    total_players: int = 0,
    cached_players: int = 0,
    no_read_players: int = 0,
) -> CostEstimate:
    """Conservative input token estimate: state + question text chars / 2 + fixed overhead."""
    q_chars = sum(
        len(q.instructions)
        + len(q.true_text or "")
        + len(q.false_text or "")
        + sum(len(lvl) for lvl in q.levels)
        for q in questions
    )
    tokens = 0
    for st in states_to_call:
        st_chars = len(json.dumps(st, separators=(",", ":")))
        tokens += (st_chars + q_chars) // 2 + OVERHEAD_TOKENS_PER_PLAYER
    usd = tokens * JEV_USD_PER_INPUT_TOKEN
    return CostEstimate(
        players_total=total_players or (len(states_to_call) + cached_players + no_read_players),
        players_cached=cached_players,
        players_no_read=no_read_players,
        players_to_call=len(states_to_call),
        est_input_tokens=tokens,
        est_usd=usd,
    )


def build_sdk_questions(
    specs: tuple[AuditQuestionSpec, ...] = AUDIT_QUESTIONS,
) -> dict[str, Noul | Score]:
    """Convert `AuditQuestionSpec` tuple into `typesafe_sdk` question objects for fan-out."""
    out: dict[str, Noul | Score] = {}
    for s in specs:
        if s.kind == "noul":
            out[s.id] = Noul(
                instructions=s.instructions,
                criteria={"true": s.true_text, "false": s.false_text},
            )
        else:
            out[s.id] = Score(
                instructions=s.instructions,
                criteria=list(s.levels),
            )
    return out


@dataclass(frozen=True)
class PlayerJevResponse:
    model_requested: str
    model_resolved: str
    input_tokens: int
    answers: dict[str, dict[str, Any]]


def parse_system_one_response(
    resp: Any,
    model_requested: str,
    specs: tuple[AuditQuestionSpec, ...] = AUDIT_QUESTIONS,
) -> PlayerJevResponse:
    """Validate and extract every requested question from a `SystemOneResponse` (or mock)."""
    model_resolved = str(getattr(resp, "model", None) or model_requested)
    usage = getattr(resp, "usage", None)
    in_tok = int(getattr(usage, "input_tokens", 0) or 0) if usage is not None else 0

    nouls = getattr(resp, "nouls", {}) or {}
    scores = getattr(resp, "scores", {}) or {}
    raw_answers = getattr(resp, "answers", {}) or {}

    parsed: dict[str, dict[str, Any]] = {}
    for s in specs:
        if s.kind == "noul":
            ans = nouls.get(s.id) or raw_answers.get(s.id)
            val = getattr(ans, "noul", None) if ans is not None else None
            if val is None and isinstance(ans, dict):
                val = ans.get("noul")
            if val is None:
                raise JevAuditError(f"Jev response missing noul answer for {s.id}")
            p = float(val)
            if not (0.0 <= p <= 1.0):
                raise JevAuditError(f"Jev noul {s.id}={p} outside [0, 1]")
            parsed[s.id] = {
                "kind": "noul",
                "value": p,
                "confidence": None,
                "probabilities": {"true": p, "false": round(1.0 - p, 6)},
            }
        else:
            ans = scores.get(s.id) or raw_answers.get(s.id)
            score_val = getattr(ans, "score", None) if ans is not None else None
            conf_val = getattr(ans, "confidence", None) if ans is not None else None
            probs_val = getattr(ans, "probabilities", None) if ans is not None else None
            if isinstance(ans, dict):
                score_val = ans.get("score", score_val)
                conf_val = ans.get("confidence", conf_val)
                probs_val = ans.get("probabilities", probs_val)
            if score_val is None:
                raise JevAuditError(f"Jev response missing score answer for {s.id}")
            sc = float(score_val)
            conf = float(conf_val) if conf_val is not None else None
            probs = dict(probs_val) if isinstance(probs_val, dict) else None
            parsed[s.id] = {
                "kind": "score",
                "value": sc,
                "confidence": conf,
                "probabilities": probs,
            }

    return PlayerJevResponse(
        model_requested=model_requested,
        model_resolved=model_resolved,
        input_tokens=in_tok,
        answers=parsed,
    )


class JevClient:
    """Thin synchronous wrapper around `typesafe_sdk.TypeSafeClient`."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = PINNED_JEV_MODEL,
        sdk_client: Any | None = None,
    ):
        self.model = model
        if sdk_client is not None:
            self._client = sdk_client
        else:
            key = api_key or typesafe_api_key()
            self._client = TypeSafeClient(api_key=key, model=model)

    def evaluate_player(
        self,
        state: dict[str, Any],
        specs: tuple[AuditQuestionSpec, ...] = AUDIT_QUESTIONS,
    ) -> PlayerJevResponse:
        questions = build_sdk_questions(specs)
        try:
            resp = self._client.system_one(state, questions)
        except (TypeSafeError, RuntimeError, ValueError, OSError) as e:
            raise JevAuditError(f"Jev API call failed ({type(e).__name__})") from None
        return parse_system_one_response(resp, self.model, specs)
