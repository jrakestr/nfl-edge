import { poolFromPlayers } from "./pool";
import type { WeekPlayer } from "@/lib/types";

export type SlateCorr = {
  player_id_a: string;
  player_id_b: string;
  corr_dk: number;
};

export type StackSuggestion = {
  player_id: string;
  player_dk_id: string;
  name: string;
  position: string;
  team: string;
  corr: number;
  score: number;
  proj: number;
  salary: number;
  value: number;
  anchorId: string;
  anchorName: string;
};

export const STACK_SUGGEST_LIMIT = 8;

/** GSIS / TEAM_DST ids only. Numeric DraftKings fallbacks never match a corr row. */
export function slateCorrIds(players: WeekPlayer[]): string[] {
  return [...new Set(players.map((p) => p.player_id).filter((id) => id && !/^\d+$/.test(id)))];
}

export function partnerId(row: SlateCorr, lockId: string): string | null {
  if (row.player_id_a === lockId) return row.player_id_b;
  if (row.player_id_b === lockId) return row.player_id_a;
  return null;
}

function byDk(players: WeekPlayer[]): Map<string, WeekPlayer> {
  const m = new Map<string, WeekPlayer>();
  for (const p of players) {
    if (p.player_dk_id && !m.has(p.player_dk_id)) m.set(p.player_dk_id, p);
  }
  return m;
}

function byGsis(players: WeekPlayer[]): Map<string, WeekPlayer> {
  const m = new Map<string, WeekPlayer>();
  for (const p of players) {
    if (p.player_id && !m.has(p.player_id)) m.set(p.player_id, p);
  }
  return m;
}

export function stackSuggestions(
  players: WeekPlayer[],
  pairs: SlateCorr[],
  locks: string[],
  excludes: string[],
  stacked: string[],
): { positive: StackSuggestion[]; negative: StackSuggestion[] } {
  if (locks.length === 0) return { positive: [], negative: [] };

  const poolIds = new Set(poolFromPlayers(players).map((p) => p.player_dk_id));
  const excl = new Set(excludes);
  const lockSet = new Set(locks);
  const stackSet = new Set(stacked);
  const dk = byDk(players);
  const gsis = byGsis(players);
  const anchors = locks.map((id) => dk.get(id)).filter((p): p is WeekPlayer => Boolean(p));

  const pos = new Map<string, StackSuggestion>();
  const neg = new Map<string, StackSuggestion>();

  for (const anchor of anchors) {
    if (!anchor.player_dk_id) continue;
    for (const row of pairs) {
      const pid = partnerId(row, anchor.player_id);
      if (!pid || row.corr_dk === 0) continue;
      const partner = gsis.get(pid);
      const dkId = partner?.player_dk_id;
      if (!partner || !dkId) continue;
      if (!poolIds.has(dkId)) continue;
      if (excl.has(dkId) || lockSet.has(dkId) || stackSet.has(dkId)) continue;
      const sd = partner.fpts_dk_sd;
      if (sd == null || !Number.isFinite(sd)) continue;
      const score = row.corr_dk * sd;
      const item: StackSuggestion = {
        player_id: partner.player_id,
        player_dk_id: dkId,
        name: partner.display_name,
        position: partner.position ?? "",
        team: partner.team ?? "",
        corr: row.corr_dk,
        score,
        proj: partner.fpts_dk_mean ?? 0,
        salary: partner.salary ?? 0,
        value: partner.value ?? 0,
        anchorId: anchor.player_dk_id,
        anchorName: anchor.display_name,
      };
      if (row.corr_dk > 0) {
        const prev = pos.get(dkId);
        if (!prev || item.score > prev.score) pos.set(dkId, item);
      } else {
        const prev = neg.get(dkId);
        if (!prev || item.score < prev.score) neg.set(dkId, item);
      }
    }
  }

  const positive = [...pos.values()].sort((a, b) => b.score - a.score).slice(0, STACK_SUGGEST_LIMIT);
  const negative = [...neg.values()].sort((a, b) => a.score - b.score).slice(0, STACK_SUGGEST_LIMIT);
  return { positive, negative };
}
