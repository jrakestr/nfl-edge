export type HistoryEntry = {
  contestTime: string | null;
  sport: string;
  gameType: string;
  entryName: string;
  place: number | null;
  points: number | null;
  winningsCash: number;
  winningsTicket: number;
  contestEntries: number | null;
  entryFee: number | null;
  placesPaid: number | null;
};

export const FEE_BUCKETS = ["free", "under $1", "$1–3", "$3–10", "over $10"] as const;
export type FeeBucket = (typeof FEE_BUCKETS)[number];

export const SIZE_BUCKETS = ["H2H", "3–20", "21–200", "201–5K", "5K–50K", "50K+"] as const;
export type SizeBucket = (typeof SIZE_BUCKETS)[number];

export type BucketRollup<B extends string = string> = {
  bucket: B;
  entries: number;
  fees: number;
  winnings: number;
  winningsTicket: number;
  net: number;
  roi: number | null;
  cashed: number;
  cashRate: number | null;
  avgPercentile: number | null;
};

export type SeasonRollup = {
  season: number;
  entries: number;
  fees: number;
  winnings: number;
  net: number;
  cumulativeNet: number;
  roi: number | null;
  cashed: number;
  cashRate: number | null;
};

export type TopFinish = {
  date: string | null;
  entryName: string;
  gameType: string;
  entryFee: number | null;
  contestEntries: number | null;
  place: number | null;
  points: number | null;
  winnings: number;
};

export type HistorySummary = {
  totals: {
    entries: number;
    fees: number;
    winnings: number;
    winningsTicket: number;
    net: number;
    roi: number | null;
    cashed: number;
    cashRate: number | null;
  };
  bySeason: SeasonRollup[];
  byFee: BucketRollup<FeeBucket>[];
  bySize: BucketRollup<SizeBucket>[];
  topFinishes: TopFinish[];
};

const ENTRY_SUFFIX_RE = /\s*\(\d+\/\d+\)\s*$/;

/** Aug–Dec stay in their calendar year; Jan–Jul belong to the prior season. */
export function nflSeason(isoOrDate: string | Date | null | undefined): number | null {
  if (!isoOrDate) return null;
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return month <= 7 ? year - 1 : year;
}

export function feeBucket(fee: number | null | undefined): FeeBucket {
  const f = fee ?? 0;
  if (f <= 0) return "free";
  if (f < 1) return "under $1";
  if (f <= 3) return "$1–3";
  if (f <= 10) return "$3–10";
  return "over $10";
}

export function sizeBucket(contestEntries: number | null | undefined): SizeBucket {
  const n = contestEntries ?? 0;
  if (n <= 2) return "H2H";
  if (n <= 20) return "3–20";
  if (n <= 200) return "21–200";
  if (n <= 5000) return "201–5K";
  if (n <= 50000) return "5K–50K";
  return "50K+";
}

function isCashed(r: HistoryEntry): boolean {
  return r.place != null && r.placesPaid != null && r.placesPaid > 0 && r.place <= r.placesPaid;
}

function rollup<B extends string>(bucket: B, rows: HistoryEntry[]): BucketRollup<B> {
  let fees = 0;
  let winnings = 0;
  let winningsTicket = 0;
  let cashed = 0;
  let pctSum = 0;
  let pctCount = 0;
  for (const r of rows) {
    fees += r.entryFee ?? 0;
    const w = (r.winningsCash ?? 0) + (r.winningsTicket ?? 0);
    winnings += w;
    winningsTicket += r.winningsTicket ?? 0;
    if (isCashed(r)) cashed += 1;
    if (r.place != null && r.contestEntries != null && r.contestEntries > 0) {
      pctSum += r.place / r.contestEntries;
      pctCount += 1;
    }
  }
  const entries = rows.length;
  const net = winnings - fees;
  return {
    bucket,
    entries,
    fees,
    winnings,
    winningsTicket,
    net,
    roi: fees > 0 ? net / fees : null,
    cashed,
    cashRate: entries > 0 ? cashed / entries : null,
    avgPercentile: pctCount > 0 ? pctSum / pctCount : null,
  };
}

export function summarizeHistory(
  rows: readonly HistoryEntry[],
  filter: { sport?: string; gameType?: string } = {},
): HistorySummary {
  const sport = filter.sport ?? "NFL";
  const gameType = filter.gameType ?? "Classic";
  const matching = rows.filter((r) => {
    if (sport && sport !== "all" && r.sport !== sport) return false;
    if (gameType && gameType !== "all" && r.gameType !== gameType) return false;
    return true;
  });

  const all = rollup("all", matching);

  const seasonMap = new Map<number, HistoryEntry[]>();
  for (const r of matching) {
    const s = nflSeason(r.contestTime);
    if (s == null) continue;
    const list = seasonMap.get(s) ?? [];
    list.push(r);
    seasonMap.set(s, list);
  }
  const seasons = [...seasonMap.keys()].sort((a, b) => a - b);
  let running = 0;
  const bySeason: SeasonRollup[] = seasons.map((season) => {
    const b = rollup(String(season), seasonMap.get(season) ?? []);
    running += b.net;
    return {
      season,
      entries: b.entries,
      fees: b.fees,
      winnings: b.winnings,
      net: b.net,
      cumulativeNet: running,
      roi: b.roi,
      cashed: b.cashed,
      cashRate: b.cashRate,
    };
  });

  const feeGroups = new Map<FeeBucket, HistoryEntry[]>(FEE_BUCKETS.map((b) => [b, []]));
  const sizeGroups = new Map<SizeBucket, HistoryEntry[]>(SIZE_BUCKETS.map((b) => [b, []]));
  for (const r of matching) {
    feeGroups.get(feeBucket(r.entryFee))!.push(r);
    sizeGroups.get(sizeBucket(r.contestEntries))!.push(r);
  }

  const byFee = FEE_BUCKETS.map((b) => rollup(b, feeGroups.get(b) ?? []));
  const bySize = SIZE_BUCKETS.map((b) => rollup(b, sizeGroups.get(b) ?? []));

  const topFinishes: TopFinish[] = [...matching]
    .map((r) => ({
      date: r.contestTime ? r.contestTime.slice(0, 10) : null,
      entryName: r.entryName.replace(ENTRY_SUFFIX_RE, ""),
      gameType: r.gameType,
      entryFee: r.entryFee,
      contestEntries: r.contestEntries,
      place: r.place,
      points: r.points,
      winnings: (r.winningsCash ?? 0) + (r.winningsTicket ?? 0),
    }))
    .filter((r) => r.winnings > 0)
    .sort((a, b) => b.winnings - a.winnings || (a.place ?? 1e9) - (b.place ?? 1e9))
    .slice(0, 10);

  return {
    totals: {
      entries: all.entries,
      fees: all.fees,
      winnings: all.winnings,
      winningsTicket: all.winningsTicket,
      net: all.net,
      roi: all.roi,
      cashed: all.cashed,
      cashRate: all.cashRate,
    },
    bySeason,
    byFee,
    bySize,
    topFinishes,
  };
}
