import { fieldLabel } from "@/lib/research/fields";
import type { Metric, Normalize } from "@/lib/research/score";

/** Signed, 2 decimals, true minus sign. Null is an em dash, never a guessed number. */
export function scoreText(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value).toFixed(2);
  if (Number(abs) === 0) return "0.00";
  return `${value < 0 ? "−" : "+"}${abs}`;
}

export function normalizeLabel(n: Normalize): string {
  return n === "zscore" ? "Z-score within position" : "Raw values";
}

/** "Target share × 3, Snap % × 1" */
export function termsText(m: Pick<Metric, "terms">): string {
  return m.terms.map((t) => `${fieldLabel(t.field)} × ${t.weight}`).join(", ");
}
