/** Display of a player's actual DK points against the run's projection. Sql-free. */

export type ActualState = "played" | "dnp";

export type ActualInput = {
  fpts_dk_mean: number | null;
  actual_dk?: number | null;
  actual_state?: ActualState | null;
};

export type ActualDisplay = {
  actual: string;
  diff: string;
  /** actual minus projected; positive means the model was light. Null when not comparable. */
  diffValue: number | null;
};

const DASH = "\u2014";
const MINUS = "\u2212";

/** One decimal, true minus sign, explicit plus. */
export function signedPts(v: number): string {
  const rounded = Math.round(Math.abs(v) * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${v > 0 ? "+" : MINUS}${rounded.toFixed(1)}`;
}

/**
 * Ungraded week (no state): em dash. Graded and no opportunity: DNP, no diff.
 * Played: actual points and actual minus projected.
 */
export function actualDisplay(p: ActualInput): ActualDisplay {
  if (!p.actual_state) return { actual: DASH, diff: DASH, diffValue: null };
  if (p.actual_state === "dnp" || p.actual_dk == null) {
    return { actual: "DNP", diff: DASH, diffValue: null };
  }
  const actual = p.actual_dk.toFixed(1);
  if (p.fpts_dk_mean == null) return { actual, diff: DASH, diffValue: null };
  const diffValue = p.actual_dk - p.fpts_dk_mean;
  return { actual, diff: signedPts(diffValue), diffValue };
}
