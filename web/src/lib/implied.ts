import { displayValue } from "@/lib/edge";

/** nflverse: positive spread = home favored. Home (total + spread) / 2, away (total − spread) / 2. */
export function impliedPoints(total: number, spread: number): { home: number; away: number } {
  return { home: (total + spread) / 2, away: (total - spread) / 2 };
}

export function impliedFromLines(
  total: number | null | undefined,
  spread: number | null | undefined,
): { home: number; away: number } | null {
  if (total == null || spread == null) return null;
  return impliedPoints(total, spread);
}

/** Implied scores from E[total] and E[home−away]. Mean when present, median otherwise. */
export function simScore(row: {
  mean_total: number | null;
  mean_spread: number | null;
  fair_total: number | null;
  fair_spread: number | null;
}): { home: number; away: number } | null {
  const total = displayValue(row.mean_total, row.fair_total);
  const spread = displayValue(row.mean_spread, row.fair_spread);
  return impliedFromLines(total, spread);
}

export function linesDiffer(
  aTotal: number | null | undefined,
  aSpread: number | null | undefined,
  bTotal: number | null | undefined,
  bSpread: number | null | undefined,
): boolean {
  if (aTotal == null || aSpread == null || bTotal == null || bSpread == null) return false;
  return aTotal !== bTotal || aSpread !== bSpread;
}
