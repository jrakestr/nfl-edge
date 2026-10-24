"""Atomic Jev (TypeSafe System One) questions and deterministic code composition rules for DFS Lineup Audit.

Every question here follows TypeSafe's System One discipline:
  - One proposition per question (no compound "and/or" criteria).
  - Backtick-wrapped JSON paths (`player.name`, `injury.practice_3`, `news`, `teammates`) so Jev
    anchors to the exact keys in the structured state.
  - Concrete, descriptive criteria for Noul (`true` / `false`) and Score (ordered 5-level rubrics).
  - Zero math or threshold comparisons: numeric projections, salaries, and ownership live in the
    simulator and deterministic code. Jev reads text (news, injury comments, practice progression,
    teammate status) and emits raw probabilities/scores.

Code composition (`evaluate_player_verdict`) turns raw stored judgments into:
  - `VETO`: high-probability (`p >= noul_yes_min`) risk on a disqualifying Noul (`snap_cap_risk`,
    `inactive_or_decoy_risk`, `dnp_friday_unresolved`) or severe Score (`injury_limitation_severity >= 3.0`
    with `confidence >= score_conf_min`).
  - `FLAG`: any Noul in the uncertainty band `(noul_no_max, noul_yes_min)`, or a Score with
    `confidence < score_conf_min`, or moderate role/committee risk (`committee_erosion_risk >= noul_yes_min`).
  - `KEEP`: all evaluated questions clear the safe band.
  - `NO_READ`: player had no pre-cutoff news or injury report row (zero API calls made).
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Literal

PINNED_JEV_MODEL = "jev-1.14.0"

THRESHOLDS: dict[str, float] = {
    "noul_yes_min": 0.80,
    "noul_no_max": 0.20,
    "score_conf_min": 0.65,
    "veto_injury_score_min": 3.0,
    "boost_role_score_min": 3.0,
}

QuestionKind = Literal["noul", "score"]
VerdictKind = Literal["KEEP", "FLAG", "VETO", "NO_READ"]


@dataclass(frozen=True)
class AuditQuestionSpec:
    id: str
    label: str
    kind: QuestionKind
    instructions: str
    true_text: str | None = None
    false_text: str | None = None
    levels: tuple[str, ...] = ()
    veto_on_yes: bool = False
    flag_on_yes: bool = False


AUDIT_QUESTIONS: tuple[AuditQuestionSpec, ...] = (
    AuditQuestionSpec(
        id="snap_cap_risk",
        label="Snap count / pitch count risk",
        kind="noul",
        instructions=(
            "Based on `news` and `injury.comment` for `player.name`, is there an explicit report "
            "or coaching statement that `player.name` will be on a snap count, pitch count, or "
            "managed workload in this game?"
        ),
        true_text=(
            "`news` or `injury.comment` explicitly mentions a snap count, pitch count, limited "
            "rep cap, or rotational easing back from injury for `player.name`."
        ),
        false_text=(
            "Neither `news` nor `injury.comment` mentions a snap count, pitch count, or limited "
            "workload for `player.name`."
        ),
        veto_on_yes=True,
    ),
    AuditQuestionSpec(
        id="inactive_or_decoy_risk",
        label="Game-time decision / decoy risk",
        kind="noul",
        instructions=(
            "Based on `injury` and `news` for `player.name`, is `player.name` a game-time decision, "
            "doubtful to play a full game, or at high risk of being active only as a decoy or "
            "emergency backup?"
        ),
        true_text=(
            "`injury.status` or `news` indicates `player.name` is doubtful, a true game-time "
            "decision with unresolved availability, or expected to play only in an emergency or decoy role."
        ),
        false_text=(
            "`player.name` is expected to play his normal active role without game-time decision "
            "or decoy concerns."
        ),
        veto_on_yes=True,
    ),
    AuditQuestionSpec(
        id="dnp_friday_unresolved",
        label="Late-week DNP without full clearance",
        kind="noul",
        instructions=(
            "Inspect `injury.practice_2`, `injury.practice_3`, and `news` for `player.name`. Did "
            "`player.name` miss late-week practice (`practice_3` is DNP or `practice_2` is DNP with "
            "no full practice afterward) without a clear non-injury rest explanation?"
        ),
        true_text=(
            "`injury.practice_3` is DNP (or late-week practice was missed) due to an injury rather "
            "than veteran rest, leaving availability or conditioning unresolved."
        ),
        false_text=(
            "`player.name` practiced (`FP` or `LP` with positive progression), or any missed "
            "practice is explicitly noted as veteran rest."
        ),
        veto_on_yes=True,
    ),
    AuditQuestionSpec(
        id="reaggravation_risk",
        label="Soft-tissue / recurring injury risk",
        kind="noul",
        instructions=(
            "Based on `injury.injury_type` and `news` for `player.name`, is `player.name` playing "
            "through an acute soft-tissue injury (hamstring, calf, groin, high-ankle) or a "
            "recently reaggravated injury that carries elevated in-game exit risk?"
        ),
        true_text=(
            "`injury.injury_type` or `news` describes an active hamstring, calf, groin, high-ankle, "
            "or recently reaggravated injury for `player.name`."
        ),
        false_text=(
            "`player.name` has no active soft-tissue or recently reaggravated injury noted in "
            "`injury` or `news`."
        ),
        flag_on_yes=True,
    ),
    AuditQuestionSpec(
        id="committee_erosion_risk",
        label="Backfield / target share erosion",
        kind="noul",
        instructions=(
            "Based on `news` and `teammates` for `player.name`, do recent reports indicate that a "
            "returning teammate or coaching adjustment will reduce `player.name`'s touches, routes, "
            "or red-zone role compared to prior weeks?"
        ),
        true_text=(
            "`news` or `teammates` indicates a teammate is returning from injury or earning a larger "
            "split that directly cuts into `player.name`'s workload."
        ),
        false_text=(
            "No report in `news` or `teammates` suggests `player.name` is losing touches or routes "
            "to a teammate."
        ),
        flag_on_yes=True,
    ),
    AuditQuestionSpec(
        id="teammate_absence_boost",
        label="Vacated role boost from injured teammate",
        kind="noul",
        instructions=(
            "Based on `news` and `teammates` for `player.name`, is a key starting teammate at "
            "`player.position` (or primary target/touch competitor on `player.team`) ruled out or "
            "doubtful, explicitly expanding `player.name`'s expected role?"
        ),
        true_text=(
            "`teammates` or `news` shows a key teammate is out, IR, or doubtful, and `player.name` "
            "is positioned to absorb additional targets, routes, or carries."
        ),
        false_text=(
            "No key teammate absence in `teammates` or `news` expands `player.name`'s role beyond "
            "baseline."
        ),
        flag_on_yes=False,
    ),
    AuditQuestionSpec(
        id="injury_limitation_severity",
        label="Injury limitation severity",
        kind="score",
        instructions=(
            "Using `injury` and `news` for `player.name`, rate how severely an injury or physical "
            "limitation threatens `player.name`'s ability to play a full, unrestricted workload."
        ),
        levels=(
            "No injury limitation: healthy, full practice participation, or veteran rest only",
            "Minor ding: listed on report but practicing in full and cleared without restrictions",
            "Moderate concern: limited practice participation or playing through a manageable issue",
            "High concern: questionable with late-week limitations, snap count talk, or soft-tissue issue",
            "Severe limitation: doubtful, game-time decision after missed practices, or unlikely to finish",
        ),
    ),
    AuditQuestionSpec(
        id="role_clarity_rubric",
        label="Beat-report role security",
        kind="score",
        instructions=(
            "Using `news`, `teammates`, and `player` for `player.name`, rate how secure and "
            "featured `player.name`'s offensive role is entering this game."
        ),
        levels=(
            "Unclear or shrinking backup role: buried on depth chart or losing snaps",
            "Rotational committee piece: volatile snaps or dependent on game script",
            "Steady starter: normal baseline role with no major change in `news`",
            "Featured starter: locked-in high snap share and clear primary option",
            "Expanded bellcow / alpha role: primary starter absorbing extra work from `teammates` injuries",
        ),
    ),
)

QUESTIONS_BY_ID: dict[str, AuditQuestionSpec] = {q.id: q for q in AUDIT_QUESTIONS}


def question_hash(spec: AuditQuestionSpec) -> str:
    """Deterministic SHA-256 hex prefix (32 chars) over the question spec."""
    payload = {
        "id": spec.id,
        "kind": spec.kind,
        "instructions": spec.instructions,
        "true": spec.true_text,
        "false": spec.false_text,
        "levels": list(spec.levels),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def to_api_question_dict(spec: AuditQuestionSpec) -> dict[str, Any]:
    """Wire format for `typesafe-sdk` / `POST /v1/systemone`."""
    if spec.kind == "noul":
        return {
            "type": "noul",
            "instructions": spec.instructions,
            "criteria": {"true": spec.true_text, "false": spec.false_text},
        }
    return {
        "type": "score",
        "instructions": spec.instructions,
        "criteria": list(spec.levels),
    }


@dataclass(frozen=True)
class PlayerAuditEvaluation:
    verdict: VerdictKind
    reasons: list[str]
    veto_questions: list[str]
    flag_questions: list[str]
    uncertain_questions: list[str]
    boost_signal: bool


def evaluate_player_verdict(
    judgments: dict[str, dict[str, Any]],
    thresholds: dict[str, float] = THRESHOLDS,
) -> PlayerAuditEvaluation:
    """Pure code composition over stored raw judgments (`question_id -> {kind, value, confidence}`).

    Never calls the model: changing `thresholds` re-evaluates existing stored rows immediately.
    """
    if not judgments or all(j.get("kind") == "no_read" for j in judgments.values()):
        return PlayerAuditEvaluation(
            verdict="NO_READ",
            reasons=["No pre-kickoff news or injury report row."],
            veto_questions=[],
            flag_questions=[],
            uncertain_questions=[],
            boost_signal=False,
        )

    yes_min = thresholds["noul_yes_min"]
    no_max = thresholds["noul_no_max"]
    conf_min = thresholds["score_conf_min"]
    veto_score_min = thresholds["veto_injury_score_min"]

    vetoes: list[str] = []
    flags: list[str] = []
    uncertain: list[str] = []
    reasons: list[str] = []
    boost = False

    for spec in AUDIT_QUESTIONS:
        j = judgments.get(spec.id)
        if not j or j.get("value") is None:
            continue
        val = float(j["value"])
        conf = float(j["confidence"]) if j.get("confidence") is not None else None

        if spec.kind == "noul":
            if spec.veto_on_yes and val >= yes_min:
                vetoes.append(spec.id)
                reasons.append(f"{spec.label} (p={val:.2f})")
            elif spec.flag_on_yes and val >= yes_min:
                flags.append(spec.id)
                reasons.append(f"{spec.label} (p={val:.2f})")
            elif spec.id == "teammate_absence_boost" and val >= yes_min:
                boost = True
                reasons.append(f"{spec.label} (p={val:.2f})")
            elif no_max < val < yes_min and (spec.veto_on_yes or spec.flag_on_yes):
                uncertain.append(spec.id)
                flags.append(spec.id)
                reasons.append(f"Uncertain {spec.label.lower()} (p={val:.2f})")
        elif spec.kind == "score":
            if conf is not None and conf < conf_min:
                uncertain.append(spec.id)
                flags.append(spec.id)
                reasons.append(f"Low confidence on {spec.label.lower()} (conf={conf:.2f})")
            elif spec.id == "injury_limitation_severity" and val >= veto_score_min:
                vetoes.append(spec.id)
                reasons.append(f"{spec.label} ({val:.1f}/4, conf={conf or 0.0:.2f})")
            elif spec.id == "injury_limitation_severity" and val >= 2.0:
                flags.append(spec.id)
                reasons.append(f"{spec.label} ({val:.1f}/4)")
            elif spec.id == "role_clarity_rubric" and val <= 1.2:
                flags.append(spec.id)
                reasons.append(f"Shaky role security ({val:.1f}/4)")
            elif spec.id == "role_clarity_rubric" and val >= thresholds["boost_role_score_min"]:
                boost = True

    if vetoes:
        verdict: VerdictKind = "VETO"
    elif flags:
        verdict = "FLAG"
    else:
        verdict = "KEEP"

    return PlayerAuditEvaluation(
        verdict=verdict,
        reasons=reasons or ["Cleared all injury and role checks."],
        veto_questions=vetoes,
        flag_questions=flags,
        uncertain_questions=uncertain,
        boost_signal=boost,
    )
