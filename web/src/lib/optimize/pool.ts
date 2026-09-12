import { inOptimizerPool } from "@/lib/injury-status";
import { normalizePosition } from "@/components/ui/PositionPill";
import type { WeekPlayer } from "@/lib/types";
import type { OptPlayer, OptPos } from "./types";

export const PROJECTION_MINIMUM = 5;

export function toOptPlayer(p: WeekPlayer): OptPlayer | null {
  const id = p.player_dk_id;
  const pos = normalizePosition(p.position);
  if (!id || !pos || p.salary == null || !p.team) return null;
  if (!inOptimizerPool(p.override_status, p.override_updated_at, p.run_created_at)) return null;
  const proj = p.fpts_dk_mean ?? 0;
  if (pos !== "DST" && proj < PROJECTION_MINIMUM) return null;
  const value = p.value ?? (p.salary > 0 ? proj / (p.salary / 1000) : 0);
  return {
    player_dk_id: id,
    name: p.display_name,
    position: pos as OptPos,
    team: p.team,
    opponent: p.opponent ?? null,
    salary: p.salary,
    proj,
    value,
    proj_own: p.proj_own ?? null,
  };
}

export function poolFromPlayers(players: WeekPlayer[]): OptPlayer[] {
  const out: OptPlayer[] = [];
  const seen = new Set<string>();
  for (const p of players) {
    const row = toOptPlayer(p);
    if (!row || seen.has(row.player_dk_id)) continue;
    seen.add(row.player_dk_id);
    out.push(row);
  }
  return out;
}

export function teamOpponents(players: OptPlayer[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of players) {
    if (p.team && p.opponent) m.set(p.team, p.opponent);
  }
  return m;
}

export function jitterProj(proj: number, randomness: number, rng: () => number): number {
  if (randomness <= 0) return proj;
  const r = randomness / 100;
  const u = rng() * 2 * r - r;
  return Math.max(0, proj * (1 + u));
}
