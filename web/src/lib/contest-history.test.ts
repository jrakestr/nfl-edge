import { describe, expect, it } from "vitest";
import {
  FEE_BUCKETS,
  SIZE_BUCKETS,
  feeBucket,
  nflSeason,
  sizeBucket,
  summarizeHistory,
  type HistoryEntry,
} from "./contest-history";

function entry(over: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    contestTime: "2025-10-12T17:00:00Z",
    sport: "NFL",
    gameType: "Classic",
    entryName: "NFL $20K Triple Option (1/3)",
    place: 100,
    points: 142.5,
    winningsCash: 6,
    winningsTicket: 0,
    contestEntries: 5000,
    entryFee: 3,
    placesPaid: 1100,
    ...over,
  };
}

describe("contest-history", () => {
  it("Scenario 1: totals, winnings (cash + ticket), net, ROI, and cash rate match hand-computed fixture", () => {
    const rows: HistoryEntry[] = [
      entry({ entryFee: 3, winningsCash: 6, winningsTicket: 0, place: 100, placesPaid: 1100 }),
      entry({ entryFee: 5, winningsCash: 0, winningsTicket: 10, place: 50, placesPaid: 50 }),
      entry({ entryFee: 10, winningsCash: 0, winningsTicket: 0, place: 501, placesPaid: 500 }),
      entry({ entryFee: 2, winningsCash: 0, winningsTicket: 0, place: 800, placesPaid: 200 }),
      entry({ sport: "NBA", entryFee: 100, winningsCash: 500 }),
    ];
    const s = summarizeHistory(rows, { sport: "NFL", gameType: "Classic" });
    expect(s.totals.entries).toBe(4);
    expect(s.totals.fees).toBe(20);
    expect(s.totals.winnings).toBe(16);
    expect(s.totals.winningsTicket).toBe(10);
    expect(s.totals.net).toBe(-4);
    expect(s.totals.roi).toBeCloseTo(-0.2, 6);
    expect(s.totals.cashed).toBe(2);
    expect(s.totals.cashRate).toBeCloseTo(0.5, 6);
  });

  it("Scenario 2: groups January/February entries into prior NFL season (Aug–Feb = one season)", () => {
    const jan = entry({ contestTime: "2026-01-12T18:00:00Z", entryFee: 10, winningsCash: 4 });
    const sep = entry({ contestTime: "2026-09-13T17:00:00Z", entryFee: 20, winningsCash: 25 });
    expect(nflSeason(jan.contestTime)).toBe(2025);
    expect(nflSeason(sep.contestTime)).toBe(2026);

    const s = summarizeHistory([jan, sep], { sport: "NFL", gameType: "Classic" });
    expect(s.bySeason.map((r) => r.season)).toEqual([2025, 2026]);
    expect(s.bySeason[0]?.net).toBe(-6);
    expect(s.bySeason[0]?.cumulativeNet).toBe(-6);
    expect(s.bySeason[1]?.net).toBe(5);
    expect(s.bySeason[1]?.cumulativeNet).toBe(-1);
  });

  it("Scenario 3: buckets fees and contest field sizes into the exact bands", () => {
    expect([0, 0.25, 2, 5, 20].map(feeBucket)).toEqual([...FEE_BUCKETS]);
    expect([2, 15, 150, 3000, 20000, 100000].map(sizeBucket)).toEqual([...SIZE_BUCKETS]);

    const rows = [
      entry({ entryFee: 0, contestEntries: 2, winningsCash: 1 }),
      entry({ entryFee: 0.25, contestEntries: 150, winningsCash: 0 }),
      entry({ entryFee: 2, contestEntries: 3000, winningsCash: 5 }),
      entry({ entryFee: 5, contestEntries: 20000, winningsCash: 0 }),
      entry({ entryFee: 20, contestEntries: 100000, winningsCash: 10 }),
    ];
    const s = summarizeHistory(rows, { sport: "NFL", gameType: "Classic" });
    expect(s.byFee.map((b) => [b.bucket, b.entries])).toEqual([
      ["free", 1],
      ["under $1", 1],
      ["$1–3", 1],
      ["$3–10", 1],
      ["over $10", 1],
    ]);
    expect(s.byFee[0]?.roi).toBeNull();
    expect(s.bySize.filter((b) => b.entries > 0).map((b) => b.bucket)).toEqual([
      "H2H",
      "21–200",
      "201–5K",
      "5K–50K",
      "50K+",
    ]);
  });

  it("supports 'all' gameType filter and sorts top 10 finishes by winnings desc", () => {
    const rows = Array.from({ length: 12 }, (_, i) =>
      entry({
        gameType: i % 2 === 0 ? "Classic" : "Showdown Captain Mode",
        entryName: `Contest ${i + 1}`,
        winningsCash: (i + 1) * 10,
      }),
    );
    const s = summarizeHistory(rows, { sport: "NFL", gameType: "all" });
    expect(s.totals.entries).toBe(12);
    expect(s.topFinishes).toHaveLength(10);
    expect(s.topFinishes[0]?.winnings).toBe(120);
    expect(s.topFinishes[9]?.winnings).toBe(30);
  });
});
