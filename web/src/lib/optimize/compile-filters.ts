import { hasStarted } from "@/lib/kickoff";
import { classicForcedInError, flexConstructionError } from "./classic";
import type { OptPlayer, SolveControls } from "./types";

export type SortKey = "value" | "proj" | "salary" | "own" | "ceiling";

export type FilterTokens = {
  lineups?: number;
  playerMinSalary?: number;
  minValue?: number;
  topValuePerPos?: number;
  sortBy?: SortKey;
  sortDir?: "asc" | "desc";
  stackTeam?: string;
  stackN?: number;
  bringBack?: number;
  fadeTeams?: string[];
  windows?: Array<"early" | "afternoon" | "primetime">;
  excludeWindows?: Array<"early" | "afternoon" | "primetime">;
  afterFour?: boolean;
  lateSwapOnly?: boolean;
  elevatedOnly?: boolean;
  totalOver?: number;
  underdogs?: boolean;
  homeAway?: "home" | "away";
  roof?: string;
  questions?: string[];
};

export type CompileResult = {
  patch: Partial<SolveControls>;
  excl: string[];
  exclNames: { player_id: string; label: string }[];
  stack: string[];
  questions: string[];
  conflict: string | null;
};

function teamSpread(p: OptPlayer): number | null {
  if (p.marketSpread == null) return null;
  return p.homeAway === "away" ? -p.marketSpread : p.marketSpread;
}

export type CompilePicks = {
  lock?: string[];
  stack?: string[];
};

export function compileFilters(
  players: OptPlayer[],
  tokens: FilterTokens,
  picks: CompilePicks = {},
): CompileResult {
  const questions = [...(tokens.questions ?? [])];
  const excl = new Set<string>();
  const reason: { player_id: string; label: string }[] = [];
  const named = new Set<string>();

  function exclude(p: OptPlayer) {
    excl.add(p.player_dk_id);
    const playerId = p.player_id ?? p.player_dk_id;
    if (named.has(playerId)) return;
    named.add(playerId);
    reason.push({ player_id: playerId, label: `${p.name} (${p.team})` });
  }

  // Locks, plus the stacked group when it has 2+ pool members — same
  // exemption rule as the exposure cap (see requiredIds in solve.ts).
  // Value filters never drop these; other filters keep current behavior.
  const inPool = new Set(players.map((p) => p.player_dk_id));
  const required = new Set((picks.lock ?? []).filter((id) => inPool.has(id)));
  const stackIds = (picks.stack ?? []).filter((id) => inPool.has(id));
  if (stackIds.length >= 2) {
    for (const id of stackIds) required.add(id);
  }
  const isExempt = (p: OptPlayer) => required.has(p.player_dk_id);

  const minValue = tokens.minValue != null && Number.isFinite(tokens.minValue) ? tokens.minValue : null;

  for (const p of players) {
    let drop = false;
    if (tokens.fadeTeams?.length) {
      const fade = new Set(tokens.fadeTeams.map((t) => t.toUpperCase()));
      if (fade.has(p.team) || (p.opponent && fade.has(p.opponent))) drop = true;
    }
    if (tokens.windows?.length) {
      if (!p.kickoffWindow || !tokens.windows.includes(p.kickoffWindow)) drop = true;
    }
    if (tokens.excludeWindows?.length && p.kickoffWindow && tokens.excludeWindows.includes(p.kickoffWindow)) {
      drop = true;
    }
    if (tokens.afterFour && (p.kickoffWindow === "early" || p.kickoffWindow == null)) drop = true;
    if (tokens.lateSwapOnly && p.gameday) {
      if (hasStarted(p.gameday, p.gametime ?? null, p.location ?? null)) drop = true;
    }
    if (tokens.elevatedOnly && !p.elevated) drop = true;
    if (tokens.totalOver != null && (p.marketTotal == null || p.marketTotal <= tokens.totalOver)) drop = true;
    if (tokens.underdogs) {
      const spr = teamSpread(p);
      if (spr == null || spr >= 0) drop = true;
    }
    if (tokens.homeAway && p.homeAway !== tokens.homeAway) drop = true;
    if (tokens.roof && (p.roof ?? "").toLowerCase() !== tokens.roof.toLowerCase()) drop = true;
    if (tokens.playerMinSalary != null && p.salary < tokens.playerMinSalary) drop = true;
    if (minValue != null && p.value < minValue && !isExempt(p)) drop = true;
    if (drop) exclude(p);
  }

  if (tokens.topValuePerPos != null && Number.isFinite(tokens.topValuePerPos)) {
    const n = Math.floor(tokens.topValuePerPos);
    if (n >= 1) {
      const byPos = new Map<string, OptPlayer[]>();
      for (const p of players) {
        const group = byPos.get(p.position);
        if (group) group.push(p);
        else byPos.set(p.position, [p]);
      }
      for (const group of byPos.values()) {
        const ranked = [...group].sort(
          (a, b) => b.value - a.value || (a.player_dk_id < b.player_dk_id ? -1 : 1),
        );
        const keep = new Set(ranked.slice(0, n).map((p) => p.player_dk_id));
        for (const p of group) {
          if (keep.has(p.player_dk_id)) continue;
          if (isExempt(p)) continue;
          exclude(p);
        }
      }
    }
  }

  const stack: string[] = [];
  if (tokens.stackTeam) {
    const team = tokens.stackTeam.toUpperCase();
    for (const p of players) {
      if (p.position === "QB" && p.team !== team) exclude(p);
      if (p.position === "QB" && p.team === team) stack.push(p.player_dk_id);
    }
  }

  const patch: Partial<SolveControls> = {};
  if (tokens.lineups != null) patch.lineups = tokens.lineups;
  if (tokens.stackN != null) patch.stackN = tokens.stackN;
  if (tokens.bringBack != null) patch.bringBack = tokens.bringBack;

  const remaining = players.filter((p) => !excl.has(p.player_dk_id));
  // sortBy/sortDir are a view, not a filter — ignored here.
  const live: SolveControls = {
    lineups: tokens.lineups ?? 5,
    salaryCap: 50000,
    minSalary: 0,
    maxExposure: 100,
    stackN: tokens.stackN ?? 0,
    bringBack: tokens.bringBack ?? 0,
    maxPerTeam: 4,
    randomness: 0,
    noQbVsDst: true,
    flexEligible: { RB: true, WR: true, TE: true },
    locks: (picks.lock ?? []).filter((id) => remaining.some((p) => p.player_dk_id === id)),
    excludes: [...excl],
    stackIds,
    requireStack: true,
  };
  const conflict =
    remaining.length < 9
      ? `${remaining.length} players remain; a classic lineup has room for 9`
      : flexConstructionError(live) ?? classicForcedInError(remaining, live);

  return {
    patch,
    excl: [...excl],
    exclNames: reason,
    stack,
    questions,
    conflict,
  };
}
