/** SQL-free helpers for /grading. Client-safe. */

export type RunPick = {
  gameId: string;
  runId: string;
  predatedKickoff: boolean;
  createdAt: string;
};

export type CalInput = {
  modelProb: number;
  outcome: number | null;
  marketType: string;
  side: string;
};

export type CalBucket = {
  lo: number;
  hi: number;
  n: number;
  hitRate: number | null;
};

/** Newest predated run per game. Hindsight (not predated) rows drop. */
export function newestPredatedRunByGame<T extends RunPick>(rows: T[]): T[] {
  const byGame = new Map<string, T>();
  for (const r of rows) {
    if (!r.predatedKickoff) continue;
    const cur = byGame.get(r.gameId);
    if (!cur || r.createdAt > cur.createdAt) byGame.set(r.gameId, r);
  }
  return [...byGame.values()];
}

export function canonicalSide(marketType: string): "home" | "over" {
  return marketType === "total" ? "over" : "home";
}

/**
 * Decile buckets on every last-snapshot predated line for the canonical side,
 * not the edge > 0 pick set. Pushes (null outcome) excluded.
 */
export function calibrationBucketsFrom(rows: CalInput[], marketType?: string | null): CalBucket[] {
  const want = marketType && marketType !== "all" ? marketType : null;
  const hits = rows.filter((r) => {
    if (r.outcome == null) return false;
    if (r.side !== canonicalSide(r.marketType)) return false;
    if (want && r.marketType !== want) return false;
    return true;
  });
  const buckets: CalBucket[] = Array.from({ length: 10 }, (_, i) => ({
    lo: i / 10,
    hi: (i + 1) / 10,
    n: 0,
    hitRate: null,
  }));
  const wins = new Array(10).fill(0);
  for (const r of hits) {
    const i = Math.min(9, Math.max(0, Math.floor(r.modelProb * 10)));
    buckets[i].n += 1;
    if (r.outcome === 1) wins[i] += 1;
  }
  return buckets.map((b, i) => ({
    ...b,
    hitRate: b.n > 0 ? wins[i] / b.n : null,
  }));
}

export function outcomeLabel(outcome: number | null | undefined): string {
  if (outcome === 1) return "Won";
  if (outcome === 0) return "Lost";
  if (outcome == null) return "Push";
  return "Push";
}

export type BetSnap = {
  marketLineId: number;
  capturedAt: string;
  isLastSnapshot: boolean;
  edge: number;
  clvPoints: number | null;
};

/**
 * CLV as the bet would have been placed: earliest edge>0 snapshot on the
 * pick side. Close-only (or first appearance at close) is null, not 0.
 */
export function firstBetClvFrom(snaps: BetSnap[]): number | null {
  const bets = snaps
    .filter((s) => s.edge > 0)
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt) || a.marketLineId - b.marketLineId);
  if (bets.length === 0) return null;
  const first = bets[0];
  if (first.isLastSnapshot) return null;
  return first.clvPoints;
}

export function spreadCoverPrimary(hasPick: boolean, outcome: number | null): string {
  return hasPick ? outcomeLabel(outcome) : "No bet";
}

export function snapshotClvTitle(count: number): string {
  if (count <= 1) return "1 snapshot. No earlier line to grade movement against.";
  return `${count} snapshots. From the first snapshot we would have bet to the close.`;
}
