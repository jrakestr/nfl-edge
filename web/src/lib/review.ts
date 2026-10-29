/**
 * Weekly slate review: pure helpers and shapes. SQL-free so client components can import it.
 * Points per $1k is actual divided by salary/1000. Contest ownership is the DraftKings
 * %Drafted column; the sim's own_field_sim never stands in for it.
 */

import { adjustedForMiss } from "@/lib/player-edit";

export const PANEL_SIZE = 15;
export const LOW_OWN_MAX = 0.1;
export const LOW_OWN_MIN_PTS_PER_K = 3;

export type ReviewSlot = {
  slot: string;
  name: string;
  dkId: string | null;
  playerId: string | null;
};

export type ReviewEntry = {
  contestKey: number;
  rank: number;
  points: number | null;
  cashed: boolean | null;
  winnings: number | null;
};

export type ReviewLineup = {
  id: string;
  stack: string | null;
  salary: number | null;
  proj: number | null;
  actual: number | null;
  winPct: number | null;
  slots: ReviewSlot[];
  entries: ReviewEntry[];
};

/** One slate player: salary, pre-slate sim rates, and nflverse actual DK points. */
export type ReviewFact = {
  playerId: string;
  name: string;
  team: string | null;
  position: string | null;
  salary: number | null;
  proj: number | null;
  sd: number | null;
  p10: number | null;
  p90: number | null;
  boom: number | null;
  bust: number | null;
  top1Pct: number | null;
  ownOurs: number | null;
  ownFieldSim: number | null;
  actual: number | null;
  /** Average of (actual minus sim) over this season's weeks before the slate. Null with no graded week. */
  meanMiss?: number | null;
};

export type ReviewContest = {
  key: number;
  name: string | null;
  entries: number;
  placesPaid: number | null;
  /** Null when the contest came from the gamecenter API (no full field, no 99th-percentile line). */
  top1Score: number | null;
  cashScore: number | null;
};

export type ContestPlayer = {
  name: string;
  position: string | null;
  own: number;
  top1Rate: number | null;
  fpts: number | null;
};

export type ReviewData = {
  week: number | string;
  site: string;
  slate: string;
  runId: string;
  totalLineups: number;
  lineups: ReviewLineup[];
  facts: ReviewFact[];
  contests: ReviewContest[];
  contest: ReviewContest | null;
  contestPlayers: ContestPlayer[];
};

export const nameKey = (name: string): string => name.trim().toLowerCase();

export function ptsPerK(pts: number | null | undefined, salary: number | null | undefined): number | null {
  if (pts == null || salary == null || salary <= 0) return null;
  return pts / (salary / 1000);
}

function median(sorted: number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export type Portfolio = {
  graded: number;
  incomplete: number;
  best: number | null;
  median: number | null;
  worst: number | null;
  meanActual: number | null;
  meanProj: number | null;
  /** Null when no contest file is loaded for the slate. */
  top1Count: number | null;
  cashCount: number | null;
};

/** Mass lineups with a saved actual. A lineup with a null actual counts as incomplete. */
export function portfolio(
  lineups: Pick<ReviewLineup, "actual" | "proj">[],
  contest: Pick<ReviewContest, "top1Score" | "cashScore"> | null,
): Portfolio {
  const graded = lineups.filter((l) => l.actual != null);
  const actuals = graded.map((l) => l.actual as number).sort((a, b) => a - b);
  const projs = graded.map((l) => l.proj).filter((v): v is number => v != null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
  return {
    graded: graded.length,
    incomplete: lineups.length - graded.length,
    best: actuals.length ? actuals[actuals.length - 1]! : null,
    median: actuals.length ? median(actuals) : null,
    worst: actuals.length ? actuals[0]! : null,
    meanActual: mean(actuals),
    meanProj: mean(projs),
    top1Count:
      contest && contest.top1Score != null ? actuals.filter((a) => a >= (contest.top1Score as number)).length : null,
    cashCount:
      contest && contest.cashScore != null ? actuals.filter((a) => a >= (contest.cashScore as number)).length : null,
  };
}

export type ContestRow = {
  name: string;
  position: string | null;
  team: string | null;
  salary: number | null;
  own: number;
  top1Rate: number | null;
  pts: number | null;
  ptsPerK: number | null;
};

/** Contest player table joined to slate salaries by name. */
export function contestRows(players: ContestPlayer[], facts: ReviewFact[]): ContestRow[] {
  const byName = new Map(facts.map((f) => [nameKey(f.name), f]));
  return players.map((p) => {
    const f = byName.get(nameKey(p.name));
    const salary = f?.salary ?? null;
    return {
      name: p.name,
      position: f?.position ?? p.position,
      team: f?.team ?? null,
      salary,
      own: p.own,
      top1Rate: p.top1Rate,
      pts: p.fpts,
      ptsPerK: ptsPerK(p.fpts, salary),
    };
  });
}

/** Most-owned players in the contest. */
export function chalk(rows: ContestRow[]): ContestRow[] {
  return [...rows].sort((a, b) => b.own - a.own).slice(0, PANEL_SIZE);
}

/** Under 10% owned and at least 3 points per $1k, highest points first. */
export function lowOwnedHits(rows: ContestRow[]): ContestRow[] {
  return rows
    .filter((r) => r.own < LOW_OWN_MAX && r.ptsPerK != null && r.ptsPerK >= LOW_OWN_MIN_PTS_PER_K)
    .sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))
    .slice(0, PANEL_SIZE);
}

/** Share of the lineups that roster each player, keyed by lowercase name. */
export function exposureByName(lineups: Pick<ReviewLineup, "slots">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of lineups) {
    for (const s of l.slots) counts.set(nameKey(s.name), (counts.get(nameKey(s.name)) ?? 0) + 1);
  }
  const out = new Map<string, number>();
  for (const [k, n] of counts) out.set(k, n / Math.max(1, lineups.length));
  return out;
}

export type ScorerRow = {
  name: string;
  position: string | null;
  team: string | null;
  salary: number | null;
  proj: number | null;
  adjusted: number | null;
  actual: number;
  contestOwn: number | null;
  ours: number;
  missed: boolean;
};

/**
 * Highest actual DK scores on the slate. Actual is the nflverse total; DST has none there
 * and falls back to the contest FPTS when a file is loaded. A player in none of our lineups is missed.
 */
export function topScorers(
  facts: ReviewFact[],
  contestPlayers: ContestPlayer[],
  lineups: Pick<ReviewLineup, "slots">[],
): ScorerRow[] {
  const contest = new Map(contestPlayers.map((p) => [nameKey(p.name), p]));
  const ours = exposureByName(lineups);
  const rows: ScorerRow[] = [];
  for (const f of facts) {
    const c = contest.get(nameKey(f.name));
    const actual = f.actual ?? c?.fpts ?? null;
    if (actual == null) continue;
    const share = ours.get(nameKey(f.name)) ?? 0;
    rows.push({
      name: f.name,
      position: f.position,
      team: f.team,
      salary: f.salary,
      proj: f.proj,
      adjusted: adjustedProj(f),
      actual,
      contestOwn: c ? c.own : null,
      ours: share,
      missed: share === 0,
    });
  }
  return rows.sort((a, b) => b.actual - a.actual).slice(0, PANEL_SIZE);
}

/** The players table's Adjusted column, rebuilt for the slate: sim plus his earlier-week miss. */
export function adjustedProj(f: Pick<ReviewFact, "proj" | "meanMiss">): number | null {
  return adjustedForMiss(f.proj, f.meanMiss);
}

export const ACCURACY_GROUPS = ["All", "QB", "RB", "WR", "TE"] as const;

export type AccuracyRow = {
  group: string;
  n: number;
  simMae: number;
  adjMae: number;
  /** Mean of actual minus projection. Positive means the projection ran low. */
  simBias: number;
  adjBias: number;
};

export type ProjectionAccuracy = {
  rows: AccuracyRow[];
  /** Players with a sim and an actual but no earlier graded week, left out of both columns. */
  noMiss: number;
};

function meanOf(xs: number[]): number {
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

/**
 * Sim against Adjusted on the same players: a positive sim projection, an actual, and an
 * earlier-week miss. A player with no miss has no Adjusted and is counted in `noMiss`.
 */
export function projectionAccuracy(facts: ReviewFact[]): ProjectionAccuracy {
  const graded = facts.filter((f) => f.actual != null && f.proj != null && f.proj > 0);
  const both = graded.filter((f) => adjustedProj(f) != null);
  const rows: AccuracyRow[] = [];
  for (const group of ACCURACY_GROUPS) {
    const set = group === "All" ? both : both.filter((f) => f.position === group);
    if (!set.length) continue;
    const simErr = set.map((f) => (f.actual as number) - (f.proj as number));
    const adjErr = set.map((f) => (f.actual as number) - (adjustedProj(f) as number));
    rows.push({
      group,
      n: set.length,
      simMae: meanOf(simErr.map(Math.abs)),
      adjMae: meanOf(adjErr.map(Math.abs)),
      simBias: meanOf(simErr),
      adjBias: meanOf(adjErr),
    });
  }
  return { rows, noMiss: graded.length - both.length };
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 3) return null;
  const mx = meanOf(xs);
  const my = meanOf(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) ** 2;
    syy += (ys[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

export type LineupAccuracy = {
  n: number;
  simMean: number;
  adjMean: number;
  actualMean: number;
  /** Correlation of lineup projection with lineup actual across the graded lineups. */
  simCorr: number | null;
  adjCorr: number | null;
};

/**
 * Nine-slot totals under the sim and under Adjusted. A slot with no earlier-week miss keeps
 * its sim number in the Adjusted total. Lineups with no actual or an unresolved slot are left out.
 */
export function lineupAccuracy(lineups: Pick<ReviewLineup, "actual" | "slots">[], facts: ReviewFact[]): LineupAccuracy | null {
  const byId = new Map(facts.map((f) => [f.playerId, f]));
  const byName = new Map(facts.map((f) => [nameKey(f.name), f]));
  const sims: number[] = [];
  const adjs: number[] = [];
  const acts: number[] = [];
  for (const l of lineups) {
    if (l.actual == null) continue;
    let sim = 0;
    let adj = 0;
    let ok = true;
    for (const s of l.slots) {
      const f = (s.playerId ? byId.get(s.playerId) : undefined) ?? byName.get(nameKey(s.name));
      if (!f || f.proj == null) {
        ok = false;
        break;
      }
      sim += f.proj;
      adj += adjustedProj(f) ?? f.proj;
    }
    if (!ok) continue;
    sims.push(sim);
    adjs.push(adj);
    acts.push(l.actual);
  }
  if (!acts.length) return null;
  return {
    n: acts.length,
    simMean: meanOf(sims),
    adjMean: meanOf(adjs),
    actualMean: meanOf(acts),
    simCorr: pearson(sims, acts),
    adjCorr: pearson(adjs, acts),
  };
}

export type DrawerSlot = {
  slot: string;
  name: string;
  position: string | null;
  fpts: number | null;
  top1Pct: number | null;
  leverage: number | null;
  contestLeverage: number | null;
  sd: number | null;
  boom: number | null;
  bust: number | null;
  ceiling: number | null;
  floor: number | null;
};

export type DrawerBreakdown = {
  slots: DrawerSlot[];
  /** Sum of the nine contest FPTS; null when no file is loaded or any slot has none. */
  total: number | null;
  /** Names with no contest FPTS. The total stays empty while this is non-empty. */
  missing: string[];
};

/** Best-ranked entry for the contest, or null. */
export function entryFor(lineup: Pick<ReviewLineup, "entries">, contestKey: number | null): ReviewEntry | null {
  if (contestKey == null) return null;
  const hits = lineup.entries.filter((e) => e.contestKey === contestKey);
  return hits.length ? hits.reduce((a, b) => (b.rank < a.rank ? b : a)) : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Nine slots with sim rates. Contest FPTS and the second leverage need a loaded file;
 * pre-slate leverage is own_ours - own_field_sim from the run itself.
 */
export function drawerBreakdown(
  lineup: Pick<ReviewLineup, "slots">,
  facts: ReviewFact[],
  contestPlayers: ContestPlayer[] | null,
): DrawerBreakdown {
  const byId = new Map(facts.map((f) => [f.playerId, f]));
  const byName = new Map(facts.map((f) => [nameKey(f.name), f]));
  const contest = contestPlayers ? new Map(contestPlayers.map((p) => [nameKey(p.name), p])) : null;
  const slots: DrawerSlot[] = lineup.slots.map((s) => {
    const f = (s.playerId ? byId.get(s.playerId) : undefined) ?? byName.get(nameKey(s.name));
    const c = contest?.get(nameKey(s.name));
    return {
      slot: s.slot,
      name: s.name,
      position: f?.position ?? null,
      fpts: c?.fpts ?? null,
      top1Pct: f?.top1Pct ?? null,
      leverage: f && f.ownOurs != null && f.ownFieldSim != null ? f.ownOurs - f.ownFieldSim : null,
      contestLeverage: f && f.ownOurs != null && c ? f.ownOurs - c.own : null,
      sd: f?.sd ?? null,
      boom: f?.boom ?? null,
      bust: f?.bust ?? null,
      ceiling: f?.p90 ?? null,
      floor: f?.p10 ?? null,
    };
  });
  if (!contest) return { slots, total: null, missing: [] };
  const missing = slots.filter((s) => s.fpts == null).map((s) => s.name);
  const total = missing.length ? null : round2(slots.reduce((sum, s) => sum + (s.fpts as number), 0));
  return { slots, total, missing };
}

export const dash = "—";

export function fixed(n: number | null | undefined, digits = 1): string {
  return n == null ? dash : n.toFixed(digits);
}

export function signedFixed(n: number | null | undefined, digits = 1): string {
  if (n == null) return dash;
  return `${n < 0 ? "−" : n > 0 ? "+" : ""}${Math.abs(n).toFixed(digits)}`;
}