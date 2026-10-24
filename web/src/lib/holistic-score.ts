import type { Hist, PlayerNewsItem, WeekPlayer } from "@/lib/types";
import type { DefenseVsPosition, PlayerUsage } from "@/lib/usage";

export type HistogramStats = {
  total: number;
  lo: number;
  hi: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  mean: number;
};

/** Pure server/client safe quantile & mean computation from a 20-bin Hist ({ bins, counts }). */
export function computeHistStats(hist: Hist | null): HistogramStats | null {
  if (!hist || hist.counts.length === 0 || hist.bins.length < 2) return null;
  const { bins, counts } = hist;
  const nBins = Math.min(counts.length, bins.length - 1);
  const total = counts.slice(0, nBins).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const lo = bins[0]!;
  const hi = bins[nBins]!;
  let weightedSum = 0;
  for (let i = 0; i < nBins; i++) {
    const mid = (bins[i]! + bins[i + 1]!) / 2;
    weightedSum += mid * counts[i]!;
  }
  const mean = weightedSum / total;

  const quantileAt = (q: number): number => {
    const target = q * total;
    let cum = 0;
    for (let i = 0; i < nBins; i++) {
      const c = counts[i]!;
      const b0 = bins[i]!;
      const b1 = bins[i + 1]!;
      if (cum + c >= target && c > 0) {
        const frac = (target - cum) / c;
        return b0 + frac * (b1 - b0);
      }
      cum += c;
    }
    return hi;
  };

  return {
    total,
    lo,
    hi,
    p10: quantileAt(0.1),
    p25: quantileAt(0.25),
    p50: quantileAt(0.5),
    p75: quantileAt(0.75),
    p90: quantileAt(0.9),
    mean,
  };
}

export type HolisticTier = "ELITE" | "STRONG" | "FLEX" | "FADE";

export type HolisticSubscores = {
  /** 0–99: Simulated mean + ceiling upside. */
  projection: number;
  /** 0–99: Snap share, target/touch role, and L3 vs season trend. */
  usage: number;
  /** 0–99: Opponent positional points allowed + game total environment. */
  matchup: number;
  /** 0–99: Salary efficiency (value) + floor stability. */
  value: number;
  /** -15..+10: News & injury status signal adjustment. */
  newsDelta: number;
};

export type HolisticAssessment = {
  /** Composite 0–99 holistic score. */
  score: number;
  tier: HolisticTier;
  subscores: HolisticSubscores;
  newsSignal: "positive" | "neutral" | "caution" | "negative";
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function tierFromScore(score: number): HolisticTier {
  if (score >= 82) return "ELITE";
  if (score >= 66) return "STRONG";
  if (score >= 48) return "FLEX";
  return "FADE";
}

export function analyzeNewsSignal(
  news: PlayerNewsItem[],
  overrideStatus?: string | null,
): { delta: number; signal: "positive" | "neutral" | "caution" | "negative" } {
  const status = (overrideStatus ?? "").toLowerCase();
  if (status === "out" || status === "ir" || status === "doubtful") {
    return { delta: -15, signal: "negative" };
  }
  if (status === "questionable") {
    return { delta: -5, signal: "caution" };
  }
  if (!news.length) {
    return { delta: 0, signal: "neutral" };
  }

  const recent = news.slice(0, 3);
  let posHits = 0;
  let negHits = 0;
  for (const item of recent) {
    const text = `${item.title} ${item.description} ${item.impact}`.toLowerCase();
    const cats = item.categories.map((c) => c.toLowerCase());
    if (
      cats.some((c) => c.includes("injury")) ||
      /\b(ruled out|did not practice|dnp|hamstring|ankle|concussion|limited|setback|questionable)\b/.test(text)
    ) {
      negHits += 1;
    }
    if (
      /\b(dominant|workhorse|bellcow|lead back|full participant|cleared|top-tier|breakout|every-down|high-volume|three touchdowns|two touchdowns|100 yards)\b/.test(
        text,
      )
    ) {
      posHits += 1;
    }
  }

  if (negHits > posHits) {
    return { delta: -6, signal: "caution" };
  }
  if (posHits > 0 && negHits === 0) {
    return { delta: 4, signal: "positive" };
  }
  return { delta: 0, signal: "neutral" };
}

/**
 * Compute a deterministic 0–99 Holistic Rating on the Player Detail page
 * combining simulation distribution, usage/role ranks, defense matchup, and news signal.
 */
export function computeDetailHolistic(args: {
  position: string | null | undefined;
  fptsHist: Hist | null;
  usage: PlayerUsage | null;
  defense: DefenseVsPosition | null;
  news: PlayerNewsItem[];
  overrideStatus?: string | null;
}): HolisticAssessment {
  const pos = (args.position ?? "WR").toUpperCase();
  const histStats = args.fptsHist ? computeHistStats(args.fptsHist) : null;
  const meanPts = histStats?.mean ?? args.usage?.season?.dk_pg ?? 10;
  const ceilPts = histStats?.p90 ?? meanPts * 1.45;
  const floorPts = histStats?.p10 ?? meanPts * 0.45;

  const posTargetMean = pos === "QB" ? 21 : pos === "RB" ? 16.5 : pos === "TE" ? 11.5 : 15.5;
  const posTargetCeil = pos === "QB" ? 31 : pos === "RB" ? 26 : pos === "TE" ? 19 : 25;

  const projNorm = (meanPts / posTargetMean) * 68 + (ceilPts / posTargetCeil) * 28;
  const projection = clamp(projNorm, 12, 99);

  // Usage subscore: snap share, opportunity rank, and L3 vs season momentum
  const snapPct = args.usage?.season?.snap_pct ?? 0.6;
  const tgtShare = args.usage?.season?.target_share ?? 0.15;
  const l3Dk = args.usage?.l3?.dk_pg ?? meanPts;
  const seasonDk = args.usage?.season?.dk_pg ?? meanPts;
  const trendBoost = seasonDk > 0 ? clamp(((l3Dk - seasonDk) / seasonDk) * 25, -8, 10) : 0;

  const dkRank = args.usage?.ranks.find((r) => r.metric === "dk_pg");
  const rankPct =
    dkRank && dkRank.of > 1 ? Math.round((1 - (dkRank.rank - 1) / (dkRank.of - 1)) * 99) : null;

  const rawUsage =
    rankPct != null
      ? rankPct * 0.65 + clamp(snapPct * 100, 20, 99) * 0.35 + trendBoost
      : clamp(snapPct * 75 + tgtShare * 110 + trendBoost, 20, 96);
  const usage = clamp(rawUsage, 15, 99);

  // Matchup subscore: Defense rank (rank 1 = allows most points = 99)
  const matchup = args.defense
    ? clamp(
        (1 - (args.defense.rank - 1) / Math.max(1, args.defense.of - 1)) * 88 + 11,
        12,
        99,
      )
    : 55;

  // Floor / Stability subscore
  const floorRatio = meanPts > 0 ? floorPts / meanPts : 0.45;
  const value = clamp(floorRatio * 105 + (meanPts / posTargetMean) * 25, 18, 99);

  const { delta: newsDelta, signal: newsSignal } = analyzeNewsSignal(
    args.news,
    args.overrideStatus,
  );

  const composite = clamp(
    projection * 0.4 + usage * 0.28 + matchup * 0.18 + value * 0.14 + newsDelta,
    1,
    99,
  );

  return {
    score: composite,
    tier: tierFromScore(composite),
    subscores: {
      projection,
      usage,
      matchup,
      value,
      newsDelta,
    },
    newsSignal,
  };
}

/**
 * Compute a deterministic 0–99 Holistic Score for a row in `PlayersList`
 * using positional percentiles (projection, ceiling, floor, value) + matchup environment + injury status.
 */
export function computeRowHolisticScore(
  player: WeekPlayer,
  pcts: {
    projPct: number | null;
    ceilPct: number | null;
    floorPct: number | null;
    valPct: number | null;
  },
): { score: number; tier: HolisticTier } | null {
  if (player.fpts_dk_mean == null) return null;
  const projP = (pcts.projPct ?? 0.5) * 99;
  const ceilP = (pcts.ceilPct ?? pcts.projPct ?? 0.5) * 99;
  const floorP = (pcts.floorPct ?? pcts.projPct ?? 0.5) * 99;
  const valP = (pcts.valPct ?? 0.5) * 99;

  const oppBoost =
    player.opp_plus_minus != null ? clamp(player.opp_plus_minus * 2.2, -10, 10) : 0;
  const totalBoost =
    player.market_total != null ? clamp((player.market_total - 44.5) * 0.9, -6, 6) : 0;
  const missBoost =
    player.mean_miss != null ? clamp(player.mean_miss * 0.8, -5, 5) : 0;

  const status = (player.override_status ?? "").toLowerCase();
  const statusPenalty =
    status === "out" || status === "ir" || status === "doubtful"
      ? -35
      : status === "questionable"
        ? -6
        : 0;

  const raw =
    projP * 0.42 +
    ceilP * 0.22 +
    valP * 0.18 +
    floorP * 0.18 +
    oppBoost +
    totalBoost +
    missBoost +
    statusPenalty;

  const score = clamp(raw, 1, 99);
  return { score, tier: tierFromScore(score) };
}
