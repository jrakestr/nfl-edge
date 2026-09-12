import { pivotEdges, type RawEdge } from "@/lib/edge";
import type { BoardRow, EdgeSide } from "@/lib/types";

/** Same published window as `nfl_edge.market.edge`. */
export const SPREAD_LO = -30;
export const SPREAD_HI = 30;
export const TOTAL_LO = 20;
export const TOTAL_HI = 80;

export type IntHist = { lo: number; counts: number[] };
export type LineGrid = { margin: IntHist; total: IntHist };

export type GridSnapshot = {
  spread_line: number | null;
  total_line: number | null;
  home_spread_odds: number | null;
  away_spread_odds: number | null;
  over_odds: number | null;
  under_odds: number | null;
  home_moneyline: number | null;
  away_moneyline: number | null;
};

export function americanToProb(a: number): number {
  return a > 0 ? 100 / (a + 100) : -a / (-a + 100);
}

export function devigTwoWay(aSide: number, aOther: number): { fair: number; hold: number } {
  const s = americanToProb(aSide);
  const o = americanToProb(aOther);
  return { fair: s / (s + o), hold: s + o - 1 };
}

export function conditionalProb(win: number, push: number): number {
  return push < 1 ? win / (1 - push) : 0.5;
}

function intHist(values: number[], lo: number, hi: number): IntHist {
  const keys = values.map((v) => Math.round(v));
  if (keys.length) {
    lo = Math.min(lo, ...keys);
    hi = Math.max(hi, ...keys);
  }
  const counts: number[] = [];
  for (let k = lo; k <= hi; k++) counts.push(keys.filter((x) => x === k).length);
  return { lo, counts };
}

export function buildLineGrid(margin: number[], total: number[]): LineGrid {
  return { margin: intHist(margin, SPREAD_LO, SPREAD_HI), total: intHist(total, TOTAL_LO, TOTAL_HI) };
}

export function lookupLine(
  hist: IntHist,
  line: number,
  specLo: number,
  specHi: number,
): [number, number, number] | null {
  if (line < specLo || line > specHi) return null;
  const n = hist.counts.reduce((a, b) => a + b, 0);
  if (n === 0) return null;
  let win = 0;
  let push = 0;
  for (let i = 0; i < hist.counts.length; i++) {
    const k = hist.lo + i;
    if (k > line) win += hist.counts[i];
    else if (k === line) push += hist.counts[i];
  }
  const winP = win / n;
  const pushP = push / n;
  return [winP, pushP, 1 - winP - pushP];
}

export function lookupSpread(grid: LineGrid, line: number): [number, number, number] | null {
  return lookupLine(grid.margin, line, SPREAD_LO, SPREAD_HI);
}

export function lookupTotal(grid: LineGrid, line: number): [number, number, number] | null {
  return lookupLine(grid.total, line, TOTAL_LO, TOTAL_HI);
}

function price(v: number | null, fallback: number): number {
  return v == null ? fallback : v;
}

function side(model: number, market: number, px: number): EdgeSide {
  return { model_prob: model, market_prob: market, edge: model - market, kelly_fraction: 0, price: px };
}

const EMPTY: BoardRow["edges"] = {
  spread_home: null,
  spread_away: null,
  total_over: null,
  total_under: null,
  ml_home: null,
  ml_away: null,
};

/**
 * Six-side edges from the persisted grid at the current snapshot.
 * Moneyline is the grid at spread 0 (push-conditional), not home_win_prob.
 */
export function edgesFromGrid(grid: LineGrid, snap: GridSnapshot, defaultPrice = -110): BoardRow["edges"] {
  const out = { ...EMPTY };
  if (snap.spread_line != null) {
    const looked = lookupSpread(grid, snap.spread_line);
    if (looked) {
      const [win, push] = looked;
      const p = conditionalProb(win, push);
      const prA = price(snap.home_spread_odds, defaultPrice);
      const prB = price(snap.away_spread_odds, defaultPrice);
      const { fair } = devigTwoWay(prA, prB);
      out.spread_home = side(p, fair, prA);
      out.spread_away = side(1 - p, 1 - fair, prB);
    }
  }
  if (snap.total_line != null) {
    const looked = lookupTotal(grid, snap.total_line);
    if (looked) {
      const [win, push] = looked;
      const p = conditionalProb(win, push);
      const prA = price(snap.over_odds, defaultPrice);
      const prB = price(snap.under_odds, defaultPrice);
      const { fair } = devigTwoWay(prA, prB);
      out.total_over = side(p, fair, prA);
      out.total_under = side(1 - p, 1 - fair, prB);
    }
  }
  if (snap.home_moneyline != null || snap.away_moneyline != null) {
    const looked = lookupSpread(grid, 0);
    if (looked) {
      const [win, push] = looked;
      const p = conditionalProb(win, push);
      const prA = price(snap.home_moneyline, defaultPrice);
      const prB = price(snap.away_moneyline, defaultPrice);
      const { fair } = devigTwoWay(prA, prB);
      out.ml_home = side(p, fair, prA);
      out.ml_away = side(1 - p, 1 - fair, prB);
    }
  }
  return out;
}

export type PersistedEdge = RawEdge & { market_line_id: number };

/**
 * Use persisted edges only when they were computed at this snapshot.
 * Otherwise look up the grid (moneyline = spread 0). No grid → empty sides.
 */
export function resolveBoardEdges(args: {
  snapshotId: number | null;
  persisted: PersistedEdge[] | null;
  persistedLineId?: number | null;
  grid: LineGrid | null;
  snap: GridSnapshot;
  defaultPrice?: number;
}): BoardRow["edges"] {
  const persistedId = args.persistedLineId ?? args.persisted?.[0]?.market_line_id ?? null;
  if (
    args.snapshotId != null &&
    persistedId === args.snapshotId &&
    args.persisted &&
    args.persisted.length
  ) {
    return pivotEdges(args.persisted);
  }
  if (args.grid) return edgesFromGrid(args.grid, args.snap, args.defaultPrice);
  return pivotEdges(null);
}
