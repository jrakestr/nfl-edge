/**
 * Research Lab DFS lineup audit logic (pure and client-safe: no SQL, no node:crypto).
 *
 * Mirrors `nfl_edge/research/audit_questions.py` and `nfl_edge/research/lineup_audit.py`:
 *   - 8 atomic Jev questions over text state (news, injury reports, practice progression, teammates).
 *   - Code composition (`evaluatePlayerVerdict`) turns raw stored judgments into `KEEP`, `FLAG`,
 *     `VETO`, or `NO_READ`.
 *   - Lineup composition (`composeLineupAudit`) identifies the weakest slot in an optimized lineup
 *     and suggests up to 2 cap-legal replacement swaps from the slate pool.
 *
 * Numeric starter columns (Value, Upside, Leverage, Safety, Matchup, Environment) are computed
 * deterministically from sim and `model.research_fields` — never sent to Jev.
 */
import type { LabPlayer } from "@/lib/research/score";

export type QuestionKind = "noul" | "score";
export type VerdictKind = "KEEP" | "FLAG" | "VETO" | "NO_READ";
export type LineupStatus = "CLEAR" | "FLAGGED" | "VETOED";

export type AuditQuestionSpec = {
  id: string;
  label: string;
  kind: QuestionKind;
  vetoOnYes?: boolean;
  flagOnYes?: boolean;
};

export const THRESHOLDS = {
  noulYesMin: 0.8,
  noulNoMax: 0.2,
  scoreConfMin: 0.65,
  vetoInjuryScoreMin: 3.0,
  boostRoleScoreMin: 3.0,
} as const;

export const AUDIT_QUESTIONS: readonly AuditQuestionSpec[] = [
  { id: "snap_cap_risk", label: "Snap count / pitch count risk", kind: "noul", vetoOnYes: true },
  { id: "inactive_or_decoy_risk", label: "Game-time decision / decoy risk", kind: "noul", vetoOnYes: true },
  { id: "dnp_friday_unresolved", label: "Late-week DNP without full clearance", kind: "noul", vetoOnYes: true },
  { id: "reaggravation_risk", label: "Soft-tissue / recurring injury risk", kind: "noul", flagOnYes: true },
  { id: "committee_erosion_risk", label: "Backfield / target share erosion", kind: "noul", flagOnYes: true },
  { id: "teammate_absence_boost", label: "Vacated role boost from injured teammate", kind: "noul" },
  { id: "injury_limitation_severity", label: "Injury limitation severity", kind: "score" },
  { id: "role_clarity_rubric", label: "Beat-report role security", kind: "score" },
];

export type RawJudgment = {
  kind: "noul" | "score" | "no_read";
  value: number | null;
  confidence: number | null;
};

export type PlayerAuditVerdict = {
  verdict: VerdictKind;
  reasons: string[];
  vetoQuestions: string[];
  flagQuestions: string[];
  uncertainQuestions: string[];
  boostSignal: boolean;
};

export function evaluatePlayerVerdict(
  judgments: Readonly<Record<string, RawJudgment | undefined>>,
  thresholds = THRESHOLDS,
): PlayerAuditVerdict {
  const entries = Object.values(judgments).filter((x): x is RawJudgment => x != null);
  if (entries.length === 0 || entries.every((j) => j.kind === "no_read")) {
    return {
      verdict: "NO_READ",
      reasons: ["No pre-kickoff news or injury report row."],
      vetoQuestions: [],
      flagQuestions: [],
      uncertainQuestions: [],
      boostSignal: false,
    };
  }

  const vetoQuestions: string[] = [];
  const flagQuestions: string[] = [];
  const uncertainQuestions: string[] = [];
  const reasons: string[] = [];
  let boostSignal = false;

  for (const spec of AUDIT_QUESTIONS) {
    const j = judgments[spec.id];
    if (!j || j.value == null || !Number.isFinite(j.value)) continue;
    const val = j.value;
    const conf = j.confidence != null && Number.isFinite(j.confidence) ? j.confidence : null;

    if (spec.kind === "noul") {
      if (spec.vetoOnYes && val >= thresholds.noulYesMin) {
        vetoQuestions.push(spec.id);
        reasons.push(`${spec.label} (p=${val.toFixed(2)})`);
      } else if (spec.flagOnYes && val >= thresholds.noulYesMin) {
        flagQuestions.push(spec.id);
        reasons.push(`${spec.label} (p=${val.toFixed(2)})`);
      } else if (spec.id === "teammate_absence_boost" && val >= thresholds.noulYesMin) {
        boostSignal = true;
        reasons.push(`${spec.label} (p=${val.toFixed(2)})`);
      } else if (val > thresholds.noulNoMax && val < thresholds.noulYesMin && (spec.vetoOnYes || spec.flagOnYes)) {
        uncertainQuestions.push(spec.id);
        flagQuestions.push(spec.id);
        reasons.push(`Uncertain ${spec.label.toLowerCase()} (p=${val.toFixed(2)})`);
      }
    } else if (spec.kind === "score") {
      if (conf != null && conf < thresholds.scoreConfMin) {
        uncertainQuestions.push(spec.id);
        flagQuestions.push(spec.id);
        reasons.push(`Low confidence on ${spec.label.toLowerCase()} (conf=${conf.toFixed(2)})`);
      } else if (spec.id === "injury_limitation_severity" && val >= thresholds.vetoInjuryScoreMin) {
        vetoQuestions.push(spec.id);
        reasons.push(`${spec.label} (${val.toFixed(1)}/4, conf=${(conf ?? 0).toFixed(2)})`);
      } else if (spec.id === "injury_limitation_severity" && val >= 2.0) {
        flagQuestions.push(spec.id);
        reasons.push(`${spec.label} (${val.toFixed(1)}/4)`);
      } else if (spec.id === "role_clarity_rubric" && val <= 1.2) {
        flagQuestions.push(spec.id);
        reasons.push(`Shaky role security (${val.toFixed(1)}/4)`);
      } else if (spec.id === "role_clarity_rubric" && val >= thresholds.boostRoleScoreMin) {
        boostSignal = true;
      }
    }
  }

  const verdict: VerdictKind = vetoQuestions.length > 0 ? "VETO" : flagQuestions.length > 0 ? "FLAG" : "KEEP";
  return {
    verdict,
    reasons: reasons.length > 0 ? reasons : ["Cleared all injury and role checks."],
    vetoQuestions,
    flagQuestions,
    uncertainQuestions,
    boostSignal,
  };
}

// ---------- lineup composition & swap suggester ----------

export const DK_SALARY_CAP = 50_000;

const VERDICT_SEVERITY: Record<VerdictKind, number> = {
  VETO: 3,
  FLAG: 2,
  NO_READ: 1,
  KEEP: 0,
};

export function slotEligiblePositions(slot: string, fallbackPosition = ""): ReadonlySet<string> {
  const s = slot.toUpperCase();
  if (s === "FLEX") return new Set(["RB", "WR", "TE"]);
  if (s.startsWith("QB")) return new Set(["QB"]);
  if (s.startsWith("RB")) return new Set(["RB"]);
  if (s.startsWith("WR")) return new Set(["WR"]);
  if (s.startsWith("TE")) return new Set(["TE"]);
  if (["QB", "RB", "WR", "TE"].includes(fallbackPosition)) return new Set([fallbackPosition]);
  return new Set();
}

export type PoolPlayer = {
  playerId: string;
  name: string;
  team: string;
  position: string;
  salary: number;
  projDkMean: number | null;
  verdict: VerdictKind;
  reasons: string[];
  boost: boolean;
  headline: string | null;
};

export type SwapCandidate = {
  playerId: string;
  name: string;
  team: string;
  position: string;
  salary: number;
  projDkMean: number;
  verdict: VerdictKind;
  boost: boolean;
  salaryDelta: number;
  projDelta: number;
};

export type AuditedSlot = {
  slot: string;
  playerId: string | null;
  name: string;
  team: string;
  position: string;
  salary: number;
  projDkMean: number | null;
  verdict: VerdictKind;
  reasons: string[];
  headline: string | null;
  swaps: SwapCandidate[];
};

export type AuditedLineup = {
  lineupId: string;
  salaryUsed: number;
  projFpts: number | null;
  simWinPct: number | null;
  simRoi: number | null;
  status: LineupStatus;
  vetoCount: number;
  flagCount: number;
  weakestSlot: AuditedSlot | null;
  slots: AuditedSlot[];
};

export function findSwapCandidates(opts: {
  slot: string;
  position: string;
  salary: number;
  projDkMean: number | null;
  lineupPids: ReadonlySet<string>;
  lineupSalaryUsed: number;
  pool: readonly PoolPlayer[];
  limit?: number;
  cap?: number;
}): SwapCandidate[] {
  const eligible = slotEligiblePositions(opts.slot, opts.position);
  if (eligible.size === 0) return [];
  const cap = opts.cap ?? DK_SALARY_CAP;
  const limit = opts.limit ?? 2;
  const remainingCap = Math.max(0, cap - opts.lineupSalaryUsed);
  const maxSalary = opts.salary + remainingCap;
  const baseProj = opts.projDkMean ?? 0;

  const out: SwapCandidate[] = [];
  for (const p of opts.pool) {
    if (!p.playerId || opts.lineupPids.has(p.playerId)) continue;
    if (!eligible.has(p.position)) continue;
    if (p.verdict !== "KEEP") continue;
    if (p.salary <= 0 || p.salary > maxSalary) continue;
    if (p.projDkMean == null || !Number.isFinite(p.projDkMean)) continue;
    out.push({
      playerId: p.playerId,
      name: p.name,
      team: p.team,
      position: p.position,
      salary: p.salary,
      projDkMean: p.projDkMean,
      verdict: p.verdict,
      boost: p.boost,
      salaryDelta: p.salary - opts.salary,
      projDelta: p.projDkMean - baseProj,
    });
  }

  out.sort((a, b) => {
    const scoreA = a.projDkMean + (a.boost ? 0.5 : 0);
    const scoreB = b.projDkMean + (b.boost ? 0.5 : 0);
    if (scoreB !== scoreA) return scoreB - scoreA;
    if (b.projDkMean !== a.projDkMean) return b.projDkMean - a.projDkMean;
    if (a.salary !== b.salary) return a.salary - b.salary;
    return a.name.localeCompare(b.name);
  });

  return out.slice(0, limit);
}

export type RawLineupInput = {
  lineupId: string;
  salaryUsed: number | null;
  projFpts: number | null;
  simWinPct: number | null;
  simRoi: number | null;
  players: readonly {
    slot: string;
    player_id?: string | null;
    dk_id?: string | null;
    name: string;
    team?: string | null;
    position?: string | null;
    salary: number;
    proj_fpts?: number | null;
  }[];
};

export function composeLineupAudit(
  lineup: RawLineupInput,
  poolByPid: Readonly<Record<string, PoolPlayer>>,
  dkToPid: Readonly<Record<string, string>> = {},
): AuditedLineup {
  const poolList = Object.values(poolByPid);
  const lineupPids = new Set<string>();

  const resolved = lineup.players.map((s) => {
    const pid = s.player_id ?? (s.dk_id ? dkToPid[String(s.dk_id)] : null) ?? null;
    if (pid) lineupPids.add(pid);
    const info = pid ? poolByPid[pid] : undefined;
    return {
      slot: s.slot,
      playerId: pid,
      name: s.name || info?.name || "",
      team: info?.team || s.team || "",
      position: info?.position || s.position || s.slot,
      salary: s.salary || info?.salary || 0,
      projDkMean: info?.projDkMean ?? s.proj_fpts ?? null,
      verdict: (info?.verdict ?? "NO_READ") as VerdictKind,
      reasons: info?.reasons ?? ["No pre-kickoff news or injury report row."],
      headline: info?.headline ?? null,
    };
  });

  const salaryUsed =
    lineup.salaryUsed && lineup.salaryUsed > 0
      ? lineup.salaryUsed
      : resolved.reduce((acc, r) => acc + r.salary, 0);

  let vetoCount = 0;
  let flagCount = 0;

  const slots: AuditedSlot[] = resolved.map((rs) => {
    const isDst = rs.slot.toUpperCase() === "DST" || (rs.playerId ?? "").endsWith("_DST");
    const verdict: VerdictKind = isDst ? "KEEP" : rs.verdict;
    const reasons = isDst ? ["Team defense (not audited by player text state)."] : rs.reasons;
    if (!isDst) {
      if (verdict === "VETO") vetoCount += 1;
      else if (verdict === "FLAG") flagCount += 1;
    }
    const swaps =
      !isDst && (verdict === "VETO" || verdict === "FLAG")
        ? findSwapCandidates({
            slot: rs.slot,
            position: rs.position,
            salary: rs.salary,
            projDkMean: rs.projDkMean,
            lineupPids,
            lineupSalaryUsed: salaryUsed,
            pool: poolList,
          })
        : [];
    return {
      slot: rs.slot,
      playerId: rs.playerId,
      name: rs.name,
      team: rs.team,
      position: rs.position,
      salary: rs.salary,
      projDkMean: rs.projDkMean,
      verdict,
      reasons,
      headline: rs.headline,
      swaps,
    };
  });

  const risky = slots.filter((s) => s.verdict === "VETO" || s.verdict === "FLAG");
  risky.sort((a, b) => {
    const sevDiff = VERDICT_SEVERITY[b.verdict] - VERDICT_SEVERITY[a.verdict];
    if (sevDiff !== 0) return sevDiff;
    const projA = a.projDkMean ?? 999;
    const projB = b.projDkMean ?? 999;
    if (projA !== projB) return projA - projB;
    return b.salary - a.salary;
  });

  const status: LineupStatus = vetoCount > 0 ? "VETOED" : flagCount > 0 ? "FLAGGED" : "CLEAR";

  return {
    lineupId: lineup.lineupId,
    salaryUsed,
    projFpts: lineup.projFpts,
    simWinPct: lineup.simWinPct,
    simRoi: lineup.simRoi,
    status,
    vetoCount,
    flagCount,
    weakestSlot: risky[0] ?? null,
    slots,
  };
}

// ---------- code-computed numeric columns from sim & research_fields ----------

export type NumericResearchRow = {
  playerId: string;
  name: string;
  team: string;
  position: string;
  salary: number | null;
  simMean: number | null;
  simP90: number | null;
  valueX: number | null;
  ownPct: number | null;
  verdict: VerdictKind;
  reason: string;
  headline: string | null;
  boost: boolean;
};

export function buildNumericResearchRows(
  players: readonly LabPlayer[],
  poolByPid: Readonly<Record<string, PoolPlayer>>,
): NumericResearchRow[] {
  return players.map((p) => {
    const info = poolByPid[p.playerId];
    return {
      playerId: p.playerId,
      name: p.name,
      team: p.team,
      position: p.position,
      salary: p.fields.dk_salary ?? info?.salary ?? null,
      simMean: p.fields.sim_dk_mean ?? info?.projDkMean ?? null,
      simP90: p.fields.sim_dk_p90 ?? null,
      valueX: p.fields.sim_value_x ?? null,
      ownPct: p.fields.own_pct_est ?? null,
      verdict: info?.verdict ?? "NO_READ",
      reason: info?.reasons[0] ?? "No pre-kickoff news or injury report row.",
      headline: info?.headline ?? null,
      boost: info?.boost ?? false,
    };
  });
}
