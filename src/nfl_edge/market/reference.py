"""One definition of the market line: DraftKings after effective_from, else nflverse."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from ..config import line_reference as load_ref


def _ref(ref: dict | None) -> dict:
    return ref if ref is not None else load_ref()


def _aware(ts: datetime) -> datetime:
    if getattr(ts, "tzinfo", None) is None:
        return ts.replace(tzinfo=UTC)
    return ts


def qualifies(row: dict, ref: dict | None = None) -> bool:
    r = _ref(ref)
    return (
        row.get("source") == r["source"]
        and row.get("bookmaker") == r["bookmaker"]
        and row.get("spread_line") is not None
        and row.get("total_line") is not None
    )


def _is_fallback(row: dict, ref: dict) -> bool:
    src = row.get("source")
    return src is None or src == ref["fallback_source"]


def _before_effective(kickoff: datetime, ref: dict) -> bool:
    return _aware(kickoff) < _aware(ref["effective_from"])


def _latest(rows: list[dict]) -> dict | None:
    if not rows:
        return None
    return max(rows, key=lambda s: (s["captured_at"], s["id"]))


def is_candidate(row: dict, kickoff: datetime, ref: dict | None = None) -> bool:
    r = _ref(ref)
    if _before_effective(kickoff, r):
        return _is_fallback(row, r)
    return qualifies(row, r) or _is_fallback(row, r)


def pick_latest(rows: list[dict], kickoff: datetime, ref: dict | None = None) -> dict | None:
    r = _ref(ref)
    if _before_effective(kickoff, r):
        return _latest([s for s in rows if _is_fallback(s, r)])
    return _latest([s for s in rows if qualifies(s, r)]) or _latest(
        [s for s in rows if _is_fallback(s, r)]
    )


def pick_close(rows: list[dict], kickoff: datetime, ref: dict | None = None) -> dict | None:
    r = _ref(ref)
    kick = _aware(kickoff)
    pre = []
    for s in rows:
        ts = s["captured_at"]
        if getattr(ts, "tzinfo", None) is None:
            ts = ts.replace(tzinfo=kick.tzinfo)
        if _aware(ts) < kick:
            pre.append(s)
    chosen = pick_latest(pre, kickoff, r)
    if chosen is None:
        return None
    out = dict(chosen)
    out["market_line_id"] = chosen["id"]
    return out


CANDIDATE_SQL = """
(
  (source = %s and bookmaker = %s and spread_line is not null and total_line is not null)
  or source = %s
)
"""


def candidate_params() -> tuple[Any, ...]:
    r = load_ref()
    return (r["source"], r["bookmaker"], r["fallback_source"])
