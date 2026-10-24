import type { IntHist } from "@/lib/line-grid";
import type { LineHistorySnap } from "@/lib/types";

export type TrimmedHist = {
  lo: number;
  hi: number;
  counts: number[];
  draws: number;
  max: number;
};

/** Trim leading and trailing zero bins so the bar strip spans the active support. */
export function trimIntHist(hist: IntHist | null | undefined): TrimmedHist | null {
  if (!hist || !hist.counts.length) return null;
  let first = -1;
  let last = -1;
  let draws = 0;
  for (let i = 0; i < hist.counts.length; i++) {
    const c = hist.counts[i] ?? 0;
    draws += c;
    if (c > 0) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1 || draws === 0) return null;
  const counts = hist.counts.slice(first, last + 1);
  return {
    lo: hist.lo + first,
    hi: hist.lo + last,
    counts,
    draws,
    max: Math.max(1, ...counts),
  };
}

/** 0..100 position of a value across integer bins [lo..hi] (each bin width 1, centered on k). */
export function markerPercent(value: number | null | undefined, lo: number, hi: number): number | null {
  if (value == null || Number.isNaN(value)) return null;
  const span = hi - lo + 1;
  if (span <= 0) return null;
  const raw = ((value - (lo - 0.5)) / span) * 100;
  return Math.min(100, Math.max(0, raw));
}

/** Snapshot id whose captured_at is closest to runCreatedAt (on or before preferred on ties). */
export function nearestRunSnapId(
  snaps: readonly LineHistorySnap[],
  runCreatedAt: string | Date | null | undefined,
): number | null {
  if (!snaps.length || !runCreatedAt) return null;
  const target = typeof runCreatedAt === "string" ? new Date(runCreatedAt).getTime() : runCreatedAt.getTime();
  if (Number.isNaN(target)) return null;
  let bestId: number | null = null;
  let bestDist = Infinity;
  for (const s of snaps) {
    const t = new Date(s.captured_at).getTime();
    if (Number.isNaN(t)) continue;
    const dist = Math.abs(t - target);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = s.id;
    }
  }
  return bestId;
}

/** Plain-language correlation tier matching the Prop detail rail spec in design-system.md. */
export function corrLabel(corr: number): "usually up" | "slightly up" | "usually down" | "flat" {
  if (corr >= 0.3) return "usually up";
  if (corr >= 0.1) return "slightly up";
  if (corr <= -0.1) return "usually down";
  return "flat";
}

export function signedCorr(corr: number): string {
  const abs = Math.abs(corr).toFixed(2);
  if (corr > 0) return `+${abs}`;
  if (corr < 0) return `\u2212${abs}`;
  return "0.00";
}
