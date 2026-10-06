/** BettingPros join: exact merge_key(name) AND team. No fuzzy, no name-only fallback. */

const TEAM_ALIASES: Record<string, string> = { LAR: "LA", JAC: "JAX", WSH: "WAS", JAX: "JAX" };

export function mergeKey(name: string): string {
  const s = (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "");
  return s.replace(/\s+/g, " ").trim();
}

export function normalizeTeam(team: string | null | undefined, teams: Set<string>): string | null {
  if (!team || !team.trim()) return null;
  const t = TEAM_ALIASES[team.toUpperCase().trim()] ?? team.toUpperCase().trim();
  return teams.has(t) || TEAM_ALIASES[t] ? t : t;
}

export type RosterRow = { gsis_id: string; full_name: string; team: string };

export type ClaimDraft = {
  player: string;
  team: string;
  status: string;
  channel: string;
  source_url?: string | null;
  quote?: string | null;
  confidence: string;
};

export type ResolvedClaim = ClaimDraft & {
  player_id: string;
  usage_multiplier: number;
};

export type RejectedClaim = ClaimDraft & { reason: "unmatched" | "ambiguous" };

const ZERO = new Set(["out", "doubtful", "ir"]);
const ONE = new Set(["questionable", "active"]);

export function multiplierForStatus(status: string): number | null {
  const s = status.trim().toLowerCase();
  if (ZERO.has(s)) return 0;
  if (ONE.has(s)) return 1;
  return null;
}

export function joinRoster(
  drafts: ClaimDraft[],
  roster: RosterRow[],
  teams: Set<string>,
): { matched: ResolvedClaim[]; rejected: RejectedClaim[] } {
  const prepared = roster.map((r) => ({
    ...r,
    _n: mergeKey(r.full_name),
    _t: normalizeTeam(r.team, teams),
  }));
  const matched: ResolvedClaim[] = [];
  const rejected: RejectedClaim[] = [];
  for (const row of drafts) {
    const key = mergeKey(row.player);
    const team = normalizeTeam(row.team, teams);
    const mult = multiplierForStatus(row.status);
    if (!team || mult == null) {
      rejected.push({ ...row, reason: "unmatched" });
      continue;
    }
    const hits = prepared.filter((p) => p._n === key && p._t === team);
    if (hits.length === 1) {
      matched.push({ ...row, player_id: hits[0]!.gsis_id, usage_multiplier: mult });
    } else if (hits.length > 1) {
      rejected.push({ ...row, reason: "ambiguous" });
    } else {
      rejected.push({ ...row, reason: "unmatched" });
    }
  }
  return { matched, rejected };
}
