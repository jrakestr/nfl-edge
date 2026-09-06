/**
 * Edge thresholds and formatting. Mirrors config/sim.yaml `edge:` (flat_edge 0.01,
 * strong_edge 0.03) and the design-system intensity ramp:
 * |edge| < 1% flat · 1–3% color at 70% · > 3% color at 100% and weight 600.
 */
export const FLAT = 0.01;
export const STRONG = 0.03;

export type Intensity = "flat" | "mid" | "strong";

export function intensity(edge: number | null | undefined): Intensity {
  const a = Math.abs(edge ?? 0);
  if (a < FLAT) return "flat";
  if (a < STRONG) return "mid";
  return "strong";
}

export type Direction = "pos" | "neg" | "flat";

export function direction(edge: number | null | undefined): Direction {
  if (edge == null || Math.abs(edge) < FLAT) return "flat";
  return edge > 0 ? "pos" : "neg";
}

/** Unicode minus, sign always shown. */
export function signed(x: number, digits = 1): string {
  if (Object.is(x, -0)) x = 0;
  const s = Math.abs(x).toFixed(digits);
  if (x > 0) return `+${s}`;
  if (x < 0) return `−${s}`;
  return digits === 0 ? "0" : `0.${"0".repeat(digits)}`;
}

/** Book-style line: −3.5, +3.5, PK for zero. */
export function line(x: number): string {
  if (x === 0) return "PK";
  return signed(x, Number.isInteger(x) ? 0 : 1);
}

/** Probability → "61%". */
export function pct(p: number | null | undefined, digits = 0): string {
  if (p == null) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

/** Edge (probability difference) → "+3.4%" with unicode minus. */
export function signedPct(p: number | null | undefined, digits = 1): string {
  if (p == null) return "—";
  return `${signed(p * 100, digits)}%`;
}

/** American price → "−110" / "+154". */
export function price(p: number | null | undefined): string {
  if (p == null) return "—";
  return p > 0 ? `+${p}` : `−${Math.abs(p)}`;
}

/**
 * nflverse spread (positive = home favored) → the home team's book line.
 * fair_spread 3.0 → home −3 ; spread_line 3.5 → home −3.5.
 */
export function homeLine(nflverseSpread: number): number {
  return -nflverseSpread;
}

/** Display spread/total: mean when present (Step 7), median otherwise — same rule as lines.py. */
export function displayValue(mean: number | null | undefined, median: number | null | undefined): number | null {
  return mean ?? median ?? null;
}

/** Largest positive edge across a board row's six sides (matches lines.py's max_edge). */
export function maxEdge(row: { edges: Record<string, { edge: number } | null> }): number {
  return Math.max(0, ...Object.values(row.edges).map((e) => e?.edge ?? 0));
}
