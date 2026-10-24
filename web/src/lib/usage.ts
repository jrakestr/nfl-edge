/**
 * Usage and rate stats for the player page. SQL-free: shapes, labels and the band maths only.
 * Every rate divides fantasy points by something in the box score; routes are an estimate
 * (snaps x team dropback rate) because the league stopped publishing participation data after 2025.
 */
import type { Hist } from "@/lib/types";

export type UsageWindow = "season" | "l3";

export type UsageRates = {
  window: UsageWindow;
  games: number;
  /** DraftKings points per game and the scoring variants. */
  dk_pg: number | null;
  ppr_pg: number | null;
  half_pg: number | null;
  std_pg: number | null;
  ppr_6pt_pg: number | null;
  /** Per-unit rates, DK scoring. */
  fp_per_target: number | null;
  fp_per_opportunity: number | null;
  fp_per_touch: number | null;
  fp_per_snap: number | null;
  fp_per_route_est: number | null;
  fp_per_rush: number | null;
  fp_per_dropback: number | null;
  fp_per_attempt: number | null;
  /** Volume. */
  target_share: number | null;
  snap_pct: number | null;
  routes_pg_est: number | null;
  targets_pg: number | null;
  carries_pg: number | null;
  yprr_est: number | null;
  tprr_est: number | null;
  air_yds_pg: number | null;
  wopr: number | null;
};

/** Rank of one rate among players at the position with enough games (1 = best). */
export type RateRank = { metric: RateMetric; rank: number; of: number };

export type UsageWeek = {
  season: number;
  week: number;
  opponent: string | null;
  snap_pct: number | null;
  routes_est: number | null;
  targets: number;
  carries: number;
  target_share: number | null;
  fpts_dk: number | null;
  fpts_ppr: number | null;
};

export type DefenseVsPosition = {
  defense: string;
  position: string;
  games: number;
  /** DK points allowed to the position per game and the league average. */
  allowed_pg: number;
  league_avg: number;
  /** 1 = allows the most. */
  rank: number;
  of: number;
};

export type PlayerUsage = {
  season: UsageRates | null;
  l3: UsageRates | null;
  ranks: RateRank[];
  weeks: UsageWeek[];
};

export type RateMetric =
  | "dk_pg"
  | "fp_per_target"
  | "fp_per_opportunity"
  | "fp_per_touch"
  | "fp_per_snap"
  | "fp_per_route_est"
  | "fp_per_rush"
  | "fp_per_dropback"
  | "target_share"
  | "snap_pct"
  | "routes_pg_est"
  | "yprr_est"
  | "tprr_est";

export const RATE_LABELS: Record<RateMetric, string> = {
  dk_pg: "DK points per game",
  fp_per_target: "Points per target",
  fp_per_opportunity: "Points per opportunity",
  fp_per_touch: "Points per touch",
  fp_per_snap: "Points per snap",
  fp_per_route_est: "Points per route (est.)",
  fp_per_rush: "Points per rush",
  fp_per_dropback: "Points per dropback",
  target_share: "Target share",
  snap_pct: "Snap share",
  routes_pg_est: "Routes per game (est.)",
  yprr_est: "Yards per route (est.)",
  tprr_est: "Targets per route (est.)",
};

/** Which rates matter for a position, in display order. */
export function metricsFor(position: string | null): RateMetric[] {
  switch (position) {
    case "QB":
      return ["dk_pg", "fp_per_dropback", "fp_per_rush", "fp_per_opportunity", "fp_per_snap", "snap_pct"];
    case "RB":
      return [
        "dk_pg",
        "fp_per_opportunity",
        "fp_per_touch",
        "fp_per_rush",
        "fp_per_target",
        "fp_per_snap",
        "fp_per_route_est",
        "snap_pct",
        "target_share",
      ];
    default:
      return [
        "dk_pg",
        "fp_per_target",
        "fp_per_route_est",
        "fp_per_opportunity",
        "fp_per_snap",
        "yprr_est",
        "tprr_est",
        "target_share",
        "snap_pct",
        "routes_pg_est",
      ];
  }
}

/** Format a rate for its metric: shares as whole percents, routes as counts, points to two places. */
export function formatRate(metric: RateMetric, v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  if (metric === "target_share" || metric === "snap_pct" || metric === "tprr_est") return `${Math.round(v * 100)}%`;
  if (metric === "routes_pg_est") return v.toFixed(0);
  if (metric === "dk_pg") return v.toFixed(1);
  return v.toFixed(2);
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export type Band = { label: string; lo: number; hi: number; p: number };

export const BAND_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 5],
  [5, 10],
  [10, 15],
  [15, 20],
  [20, 30],
  [30, Infinity],
];

/**
 * Chance of landing in each scoring band, from the sim's histogram of draws. Mass inside a bin is
 * spread evenly across it, so a band edge that falls mid-bin takes its share.
 */
export function bandsFromHist(hist: Hist | null, edges = BAND_EDGES): Band[] {
  const bins = hist?.bins ?? [];
  const counts = hist?.counts ?? [];
  const total = counts.reduce((a, b) => a + b, 0);
  if (bins.length < 2 || counts.length !== bins.length - 1 || total <= 0) {
    return edges.map(([lo, hi]) => ({ label: bandLabel(lo, hi), lo, hi, p: 0 }));
  }
  return edges.map(([lo, hi]) => {
    let mass = 0;
    for (let i = 0; i < counts.length; i++) {
      const b0 = Math.max(bins[i]!, 0);
      const b1 = bins[i + 1]!;
      if (b1 <= b0) continue;
      const o0 = Math.max(lo, b0);
      const o1 = Math.min(hi, b1);
      if (o1 > o0) mass += counts[i]! * ((o1 - o0) / (b1 - b0));
    }
    return { label: bandLabel(lo, hi), lo, hi, p: mass / total };
  });
}

function bandLabel(lo: number, hi: number): string {
  return hi === Infinity ? `${lo}+` : `${lo}–${hi}`;
}

/** Points allowed versus league average, as a signed difference and a plain sentence. */
export function defenseSentence(d: DefenseVsPosition | null, position: string | null): string {
  if (!d) return "No points-allowed data for this opponent yet.";
  const diff = d.allowed_pg - d.league_avg;
  const dir = diff > 1 ? "more" : diff < -1 ? "fewer" : "about the same";
  const pos = position ?? d.position;
  if (dir === "about the same") {
    return `${d.defense} allows about the league average to ${pos}s: ${d.allowed_pg.toFixed(1)} DK points per game, ${ordinal(d.rank)} of ${d.of}.`;
  }
  return `${d.defense} allows ${Math.abs(diff).toFixed(1)} ${dir} DK points per game to ${pos}s than average (${d.allowed_pg.toFixed(1)} vs ${d.league_avg.toFixed(1)}), ${ordinal(d.rank)} most of ${d.of}.`;
}
