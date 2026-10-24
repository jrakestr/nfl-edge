"""Deterministic lineup composition and replacement swap suggester for Jev Lineup Audit.

Takes raw player audit verdicts (`KEEP`, `FLAG`, `VETO`, `NO_READ`) + simulator projections and
evaluates each DFS lineup:
  - Identifies all `VETO` and `FLAG` slots in the lineup.
  - Selects the weakest slot (`VETO` first, then `FLAG`, breaking ties by lowest sim projection).
  - For any `VETO` or `FLAG` slot, suggests up to 2 replacement candidates from the slate pool:
    - Eligible for the slot (`QB` -> `QB`, `RB/RB2` -> `RB`, `WR/WR2/WR3` -> `WR`, `TE` -> `TE`,
      `FLEX` -> `RB/WR/TE`).
    - Not already in the lineup.
    - Fits within `remaining_salary + slot_player_salary` (`<= $50,000` total cap).
    - Verdict is `KEEP` (or `NO_READ` when no `KEEP` candidate exists, never `VETO` or `FLAG`).
    - Ranked by simulator `proj_dk_mean` descending (preferring candidates with a `boost` signal
      within 0.5 FPTS).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .audit_questions import VerdictKind

DK_SALARY_CAP = 50_000
FLEX_POSITIONS = frozenset({"RB", "WR", "TE"})

VERDICT_SEVERITY: dict[VerdictKind, int] = {
    "VETO": 3,
    "FLAG": 2,
    "NO_READ": 1,
    "KEEP": 0,
}


def slot_eligible_positions(slot: str, fallback_position: str = "") -> frozenset[str]:
    s = slot.upper()
    if s == "FLEX":
        return FLEX_POSITIONS
    if s.startswith("QB"):
        return frozenset({"QB"})
    if s.startswith("RB"):
        return frozenset({"RB"})
    if s.startswith("WR"):
        return frozenset({"WR"})
    if s.startswith("TE"):
        return frozenset({"TE"})
    if fallback_position in {"QB", "RB", "WR", "TE"}:
        return frozenset({fallback_position})
    return frozenset()


@dataclass(frozen=True)
class SwapCandidate:
    player_id: str
    name: str
    team: str
    position: str
    salary: int
    proj_dk_mean: float
    verdict: VerdictKind
    boost: bool
    salary_delta: int
    proj_delta: float


@dataclass(frozen=True)
class AuditedSlot:
    slot: str
    player_id: str | None
    name: str
    team: str
    position: str
    salary: int
    proj_dk_mean: float | None
    verdict: VerdictKind
    reasons: list[str]
    swaps: list[SwapCandidate]


@dataclass(frozen=True)
class AuditedLineup:
    lineup_id: str
    salary_used: int
    proj_fpts: float | None
    sim_win_pct: float | None
    sim_roi: float | None
    status: Literal["CLEAR", "FLAGGED", "VETOED"]
    veto_count: int
    flag_count: int
    weakest_slot: AuditedSlot | None
    slots: list[AuditedSlot]


def find_swap_candidates(
    slot_info: dict[str, Any],
    lineup_pids: set[str],
    lineup_salary_used: int,
    pool: list[dict[str, Any]],
    limit: int = 2,
    cap: int = DK_SALARY_CAP,
) -> list[SwapCandidate]:
    """Find up to `limit` clean (`KEEP`) replacement candidates that fit under the salary cap."""
    slot_name = str(slot_info.get("slot") or "")
    slot_pos = str(slot_info.get("position") or "")
    eligible_pos = slot_eligible_positions(slot_name, slot_pos)
    if not eligible_pos:
        return []

    slot_salary = int(slot_info.get("salary") or 0)
    slot_proj = float(slot_info.get("proj_dk_mean") or 0.0)
    remaining_cap = max(0, cap - lineup_salary_used)
    max_salary = slot_salary + remaining_cap

    candidates: list[SwapCandidate] = []
    for p in pool:
        pid = p.get("player_id")
        if not pid or pid in lineup_pids:
            continue
        if p.get("position") not in eligible_pos:
            continue
        verdict: VerdictKind = p.get("verdict", "NO_READ")
        if verdict != "KEEP":
            continue
        sal = int(p.get("salary") or 0)
        if sal <= 0 or sal > max_salary:
            continue
        proj = p.get("proj_dk_mean")
        if proj is None:
            continue
        proj_f = float(proj)
        candidates.append(
            SwapCandidate(
                player_id=str(pid),
                name=str(p.get("name") or pid),
                team=str(p.get("team") or ""),
                position=str(p.get("position") or ""),
                salary=sal,
                proj_dk_mean=proj_f,
                verdict=verdict,
                boost=bool(p.get("boost", False)),
                salary_delta=sal - slot_salary,
                proj_delta=proj_f - slot_proj,
            )
        )

    candidates.sort(
        key=lambda c: (
            -(c.proj_dk_mean + (0.5 if c.boost else 0.0)),
            -c.proj_dk_mean,
            c.salary,
            c.name,
        )
    )
    return candidates[:limit]


def compose_lineup_audit(
    lineup: dict[str, Any],
    pool_by_pid: dict[str, dict[str, Any]],
    dk_to_pid: dict[str, str] | None = None,
) -> AuditedLineup:
    """Compose a single lineup's slot verdicts, weakest slot, and legal swap candidates."""
    dk_map = dk_to_pid or {}
    pool_list = list(pool_by_pid.values())
    raw_slots = lineup.get("players") or []
    salary_used = int(lineup.get("salary_used") or 0)

    lineup_pids: set[str] = set()
    resolved_slots: list[dict[str, Any]] = []
    for s in raw_slots:
        pid = s.get("player_id") or dk_map.get(str(s.get("dk_id") or ""))
        p_info = pool_by_pid.get(str(pid)) if pid else None
        if pid:
            lineup_pids.add(str(pid))
        resolved_slots.append({
            "slot": str(s.get("slot") or ""),
            "player_id": str(pid) if pid else None,
            "name": str(s.get("name") or (p_info or {}).get("name") or ""),
            "team": str((p_info or {}).get("team") or s.get("team") or ""),
            "position": str((p_info or {}).get("position") or s.get("position") or s.get("slot") or ""),
            "salary": int(s.get("salary") or (p_info or {}).get("salary") or 0),
            "proj_dk_mean": (
                float(p_info["proj_dk_mean"])
                if p_info and p_info.get("proj_dk_mean") is not None
                else (float(s["proj_fpts"]) if s.get("proj_fpts") is not None else None)
            ),
            "verdict": (p_info or {}).get("verdict", "NO_READ"),
            "reasons": list((p_info or {}).get("reasons") or []),
        })

    if salary_used <= 0:
        salary_used = sum(x["salary"] for x in resolved_slots)

    audited_slots: list[AuditedSlot] = []
    veto_count = 0
    flag_count = 0

    for rs in resolved_slots:
        v: VerdictKind = rs["verdict"]
        is_dst = rs["slot"].upper() == "DST" or (rs["player_id"] or "").endswith("_DST")
        if is_dst:
            v = "KEEP"
            reasons = ["Team defense (not audited by player text state)."]
        else:
            reasons = rs["reasons"]
            if v == "VETO":
                veto_count += 1
            elif v == "FLAG":
                flag_count += 1

        swaps = (
            find_swap_candidates(rs, lineup_pids, salary_used, pool_list)
            if v in ("VETO", "FLAG") and not is_dst
            else []
        )
        audited_slots.append(
            AuditedSlot(
                slot=rs["slot"],
                player_id=rs["player_id"],
                name=rs["name"],
                team=rs["team"],
                position=rs["position"],
                salary=rs["salary"],
                proj_dk_mean=rs["proj_dk_mean"],
                verdict=v,
                reasons=reasons,
                swaps=swaps,
            )
        )

    risky = [s for s in audited_slots if s.verdict in ("VETO", "FLAG")]
    risky.sort(
        key=lambda s: (
            -VERDICT_SEVERITY[s.verdict],
            s.proj_dk_mean if s.proj_dk_mean is not None else 999.0,
            -s.salary,
        )
    )
    weakest = risky[0] if risky else None

    if veto_count > 0:
        status: Literal["CLEAR", "FLAGGED", "VETOED"] = "VETOED"
    elif flag_count > 0:
        status = "FLAGGED"
    else:
        status = "CLEAR"

    return AuditedLineup(
        lineup_id=str(lineup.get("lineup_id") or ""),
        salary_used=salary_used,
        proj_fpts=float(lineup["proj_fpts"]) if lineup.get("proj_fpts") is not None else None,
        sim_win_pct=float(lineup["sim_win_pct"]) if lineup.get("sim_win_pct") is not None else None,
        sim_roi=float(lineup["sim_roi"]) if lineup.get("sim_roi") is not None else None,
        status=status,
        veto_count=veto_count,
        flag_count=flag_count,
        weakest_slot=weakest,
        slots=audited_slots,
    )
