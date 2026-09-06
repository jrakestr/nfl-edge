/** Map a prop stat key onto player_stats_weekly jsonb, and corr labels. */

export const STAT_LABELS: Record<string, string> = {
  pass_yds: "Pass yds",
  rush_yds: "Rush yds",
  rec_yds: "Rec yds",
  rec: "Receptions",
  pass_td: "Pass TDs",
  anytime_td: "Anytime TD",
  rush_rec: "Rush + Rec",
};

const WEEKLY_KEY: Record<string, string> = {
  pass_yds: "passing_yards",
  rush_yds: "rushing_yards",
  rec_yds: "receiving_yards",
  rec: "receptions",
  pass_td: "passing_tds",
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
