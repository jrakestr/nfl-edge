import type { DfsLineup } from "@/lib/types";

export const SALARY_CAP = 50_000;
export const SALARY_LEAVE_MAX = 1_500;
export const CEILING_BAND = 4.0;
export const RTS_GAP = 4.0;

export type PickMode = "cash" | "tournament";

export type OverrideFact = { status: string | null; usage: number | null };

export type PickCtx = {
  dkToPlayerId: Record<string, string>;
  teams: Record<string, string>;
  positions: Record<string, string>;
  p10: Record<string, number>;
  ours: Record<string, number>;
  ownFieldSim: Record<string, number>;
  rts: Record<string, number>;
  overrides: Record<string, OverrideFact>;
  staleDkIds: Set<string>;
};

export type RemovedLineup = { lineup: DfsLineup; reasons: string[] };

export type PickResult = {
  lineup: DfsLineup | null;
  ranked: DfsLineup[];
  removed: RemovedLineup[];
  hideSimStats: boolean;
  hasRts: boolean;
};

function playerId(slot: { dk_id?: string | null; name: string }, ctx: PickCtx): string | null {
  if (slot.dk_id && ctx.dkToPlayerId[slot.dk_id]) return ctx.dkToPlayerId[slot.dk_id];
  return null;
}

function displayStatus(status: string | null | undefined): string {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "out" || s === "ir") return "Out";
  if (s === "doubtful") return "Doubtful";
  return "";
}

export function screenLineup(lineup: DfsLineup, ctx: PickCtx): string[] {
  const reasons: string[] = [];
  const seen = new Set<string>();
  for (const p of lineup.players) {
    const pid = playerId(p, ctx);
    if (p.dk_id && ctx.staleDkIds.has(p.dk_id)) {
      reasons.push(`Projected before the injury report: ${p.name}`);
    }
    if (pid) {
      if (seen.has(pid)) reasons.push("Same player twice");
      seen.add(pid);
      const ov = ctx.overrides[pid];
      const label = displayStatus(ov?.status);
      if (label) reasons.push(`${label}: ${p.name}`);
      if (ov && ov.usage != null && ov.usage < 0.5 && !label) {
        reasons.push(`Usage is cut: ${p.name}`);
      }
    }
  }
  if (lineup.salary_used == null || lineup.salary_used < SALARY_CAP - SALARY_LEAVE_MAX) {
    reasons.push("Leaves more than 1,500 unused");
  }
  return [...new Set(reasons)];
}

export function hasQbStack(lineup: DfsLineup, ctx: PickCtx): boolean {
  if (!lineup.stack?.trim()) return false;
  const qb = lineup.players.find((p) => {
    const pos = ctx.positions[p.name.toLowerCase()] ?? p.slot;
    return pos === "QB" || p.slot === "QB";
  });
  if (!qb) return false;
  const team = ctx.teams[qb.name.toLowerCase()];
  if (!team) return false;
  return lineup.players.some((p) => {
    if (p === qb) return false;
    if (ctx.teams[p.name.toLowerCase()] !== team) return false;
    const pos = ctx.positions[p.name.toLowerCase()];
    return pos === "WR" || pos === "TE";
  });
}

export function lineupFloor(lineup: DfsLineup, ctx: PickCtx): number {
  let total = 0;
  for (const p of lineup.players) {
    const pid = playerId(p, ctx);
    total += pid != null && ctx.p10[pid] != null ? ctx.p10[pid] : 0;
  }
  return total;
}

export function lineupRtsTotal(lineup: DfsLineup, ctx: PickCtx): number | null {
  if (Object.keys(ctx.rts).length === 0) return null;
  let total = 0;
  let any = false;
  for (const p of lineup.players) {
    const pid = playerId(p, ctx);
    if (pid != null && ctx.rts[pid] != null) {
      total += ctx.rts[pid];
      any = true;
    }
  }
  return any ? total : null;
}

export function summedFieldOwn(lineup: DfsLineup, ctx: PickCtx): number {
  const seen = new Set<string>();
  let total = 0;
  for (const p of lineup.players) {
    const pid = playerId(p, ctx);
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    total += ctx.ownFieldSim[pid] ?? 0;
  }
  return total;
}

export function rtsFlags(lineup: DfsLineup, ctx: PickCtx): string[] {
  if (Object.keys(ctx.rts).length === 0) return [];
  const flags: string[] = [];
  for (const p of lineup.players) {
    const pid = playerId(p, ctx);
    if (!pid) continue;
    const ours = ctx.ours[pid];
    const rts = ctx.rts[pid];
    if (ours == null || rts == null) continue;
    if (ours - rts > RTS_GAP) {
      flags.push(`Our number is much higher than RTS on ${p.name}`);
    }
  }
  return flags;
}

function tournamentReasons(lineup: DfsLineup, ctx: PickCtx, bestProj: number): string[] {
  const reasons: string[] = [];
  if (!hasQbStack(lineup, ctx)) reasons.push("Needs a quarterback stack");
  if (lineup.proj_fpts == null || lineup.proj_fpts < bestProj - CEILING_BAND) {
    reasons.push("More than 4 points behind the top projection");
  }
  return reasons;
}

function ranks(values: number[]): number[] {
  return values.map((v, i) => {
    let better = 0;
    for (let j = 0; j < values.length; j++) if (values[j]! > v) better += 1;
    return better + 1;
  });
}

export function pickOne(lineups: DfsLineup[], mode: PickMode, ctx: PickCtx): PickResult {
  const hasRts = Object.keys(ctx.rts).length > 0;
  const hideSimStats = mode === "cash";
  const removed: RemovedLineup[] = [];
  const survivors: DfsLineup[] = [];
  const bestProj = Math.max(-Infinity, ...lineups.map((l) => l.proj_fpts ?? -Infinity));

  for (const lineup of lineups) {
    const reasons = screenLineup(lineup, ctx);
    if (mode === "tournament") reasons.push(...tournamentReasons(lineup, ctx, bestProj));
    if (reasons.length) removed.push({ lineup, reasons: [...new Set(reasons)] });
    else survivors.push(lineup);
  }

  const score = (l: DfsLineup): [number, number] => {
    if (mode === "cash") return [lineupFloor(l, ctx), l.proj_fpts ?? -Infinity];
    return [l.sim_roi ?? -Infinity, l.proj_fpts ?? -Infinity];
  };

  survivors.sort((a, b) => {
    const [a0, a1] = score(a);
    const [b0, b1] = score(b);
    if (b0 !== a0) return b0 - a0;
    return b1 - a1;
  });

  let ranked = survivors;
  if (hasRts && survivors.length > 0) {
    const oursVals = survivors.map((l) => score(l)[0]);
    const rtsVals = survivors.map((l) => lineupRtsTotal(l, ctx) ?? -Infinity);
    const oursR = ranks(oursVals);
    const rtsR = ranks(rtsVals);
    ranked = survivors
      .map((l, i) => ({ l, both: oursR[i]! <= 10 && rtsR[i]! <= 10, i }))
      .sort((a, b) => {
        if (a.both !== b.both) return a.both ? -1 : 1;
        return a.i - b.i;
      })
      .map((x) => x.l);
  }

  return {
    lineup: ranked[0] ?? null,
    ranked,
    removed,
    hideSimStats,
    hasRts,
  };
}
