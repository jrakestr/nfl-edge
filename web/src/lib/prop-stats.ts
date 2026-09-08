/** Map a prop stat key onto player_stats_weekly jsonb, and corr labels. */

export const STAT_LABELS: Record<string, string> = {
  pass_yds: "Pass yds",
  pass_td: "Pass TDs",
  int: "INT",
  rush_yds: "Rush yds",
  rush_td: "Rush TDs",
  rec: "Receptions",
  rec_yds: "Rec yds",
  rec_td: "Rec TDs",
  anytime_td: "Anytime TD",
  rush_rec: "Rush + Rec",
};

export const STAT_ORDER = [
  "pass_yds",
  "pass_td",
  "int",
  "rush_yds",
  "rush_td",
  "rec",
  "rec_yds",
  "rec_td",
  "anytime_td",
] as const;

const WEEKLY_KEY: Record<string, string> = {
  pass_yds: "passing_yards",
  rush_yds: "rushing_yards",
  rec_yds: "receiving_yards",
  rec: "receptions",
  pass_td: "passing_tds",
  rush_td: "rushing_tds",
  rec_td: "receiving_tds",
  int: "interceptions",
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function weeklyValue(stats: Record<string, unknown> | null | undefined, stat: string): number | null {
  if (!stats) return null;
  if (stat === "anytime_td") {
    const a = num(stats.rushing_tds) ?? 0;
    const b = num(stats.receiving_tds) ?? 0;
    if (stats.rushing_tds == null && stats.receiving_tds == null) return null;
    return a + b;
  }
  if (stat === "rush_rec") {
    const a = num(stats.rushing_yards);
    const b = num(stats.receiving_yards);
    if (a == null && b == null) return null;
    return (a ?? 0) + (b ?? 0);
  }
  if (stat === "int") {
    return num(stats.interceptions) ?? num(stats.passing_interceptions);
  }
  const key = WEEKLY_KEY[stat];
  return key ? num(stats[key]) : null;
}

export function corrLabel(corr: number): string {
  if (corr >= 0.3) return "usually up";
  if (corr >= 0.1) return "slightly up";
  if (corr <= -0.3) return "usually down";
  if (corr <= -0.1) return "slightly down";
  return "uncorrelated";
}

/** Approximate P(stat > line) from a 20-bin histogram (edges in `bins`). */
export function pOverFromHist(hist: { bins: number[]; counts: number[] } | null | undefined, line: number): number | null {
  if (!hist || hist.bins.length < 2 || hist.counts.length === 0) return null;
  const total = hist.counts.reduce((a, c) => a + c, 0);
  if (total <= 0) return null;
  let over = 0;
  for (let i = 0; i < hist.counts.length; i++) {
    const lo = hist.bins[i]!;
    const hi = hist.bins[i + 1] ?? hist.bins[i]!;
    const n = hist.counts[i]!;
    if (hi <= line) continue;
    if (lo >= line) {
      over += n;
      continue;
    }
    const width = hi - lo;
    over += width <= 0 ? n : n * ((hi - line) / width);
  }
  return over / total;
}

/** Fair American for a yes-price (anytime TD). */
export function probToAmerican(p: number): number {
  const x = Math.min(0.99, Math.max(0.01, p));
  return x >= 0.5 ? Math.round((-100 * x) / (1 - x)) : Math.round((100 * (1 - x)) / x);
}
