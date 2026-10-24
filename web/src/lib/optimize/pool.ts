import { inOptimizerPool } from "@/lib/injury-status";
import { normalizePosition } from "@/components/ui/PositionPill";
import type { WeekPlayer } from "@/lib/types";
import { projectionPoints } from "./points";
import type { OptPlayer, OptPos, PointSource } from "./types";

export const PROJECTION_MINIMUM = 5;

export function toOptPlayer(p: WeekPlayer, source: PointSource = "dk"): OptPlayer | null {
  const id = p.player_dk_id;
  const pos = normalizePosition(p.position);
  if (!id || !pos || p.salary == null || !p.team) return null;
  if (!inOptimizerPool(p.override_status, p.override_updated_at, p.run_created_at)) return null;
  const raw = projectionPoints(p, source);
  // Defenses are not graded in the miss table, so Adjusted and Yours are blank.
  // A classic lineup still needs one, and that defense stays on DK pts.
  const proj = source === "dk" || (raw == null && pos === "DST") ? (raw ?? p.fpts_dk_mean ?? 0) : raw;
  if (proj == null) return null;
  if (pos !== "DST" && proj < PROJECTION_MINIMUM) return null;
  const fromSalary = p.salary > 0 ? proj / (p.salary / 1000) : 0;
  const value = source === "dk" || (raw == null && pos === "DST") ? (p.value ?? fromSalary) : fromSalary;
  return {
    player_id: p.player_id,
    player_dk_id: id,
    name: p.display_name,
    position: pos as OptPos,
    team: p.team,
    opponent: p.opponent ?? null,
    salary: p.salary,
    proj,
    value,
    proj_own: p.proj_own ?? null,
    p25: p.p25 ?? null,
    p90: p.ceiling ?? p.p90 ?? null,
    game_id: p.game_id,
    gameday: p.gameday ?? null,
    gametime: p.gametime ?? null,
    location: p.location ?? null,
    roof: p.roof ?? null,
    homeAway: p.home_away ?? null,
    marketTotal: p.market_total ?? null,
    marketSpread: p.market_spread ?? null,
    kickoffWindow: p.kickoff_window ?? null,
    elevated: p.elevated ?? false,
    elevatedReason: p.elevated_reason ?? null,
    depthAsOf: p.depth_as_of ?? null,
  };
}

export function playerKey(p: { player_id?: string; player_dk_id?: string; dk_id?: string }): string {
  return p.player_id || p.player_dk_id || p.dk_id || "";
}

/** Fail closed when a classic slate lists the same person under two DraftKings ids. */
export function assertUniquePlayerIds(
  rows: Array<{ player_id?: string; player_dk_id?: string; name: string; team?: string }>,
): void {
  const seen = new Map<string, { player_dk_id?: string; name: string }>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const prev = seen.get(row.player_id);
    if (!prev) {
      seen.set(row.player_id, row);
      continue;
    }
    const team = row.team ? ` (${row.team})` : "";
    throw new Error(
      `${row.name}${team} appears more than once in this slate's pool (${prev.player_dk_id} and ${row.player_dk_id}).`,
    );
  }
}

/** True when a defense has no number for this source and the pool keeps his DK pts. */
export function defenseOnDkPoints(p: WeekPlayer, source: PointSource): boolean {
  if (source === "dk") return false;
  if (normalizePosition(p.position) !== "DST") return false;
  return projectionPoints(p, source) == null;
}

export function poolFromPlayers(
  players: WeekPlayer[],
  opts: { uniquePlayerId?: boolean; points?: PointSource } = {},
): OptPlayer[] {
  const source = opts.points ?? "dk";
  const out: OptPlayer[] = [];
  const seen = new Set<string>();
  for (const p of players) {
    const row = toOptPlayer(p, source);
    if (!row || seen.has(row.player_dk_id)) continue;
    seen.add(row.player_dk_id);
    out.push(row);
  }
  if (opts.uniquePlayerId !== false) assertUniquePlayerIds(out);
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
