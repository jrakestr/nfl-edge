import { marginAccuracy } from "@/lib/margin-accuracy";
import type { GradedGame } from "@/lib/grade-types";

function g(over: Partial<GradedGame>): GradedGame {
  return {
    gameId: "x",
    week: 1,
    runId: "r",
    home: "H",
    away: "A",
    gameday: "2026-09-13",
    gametime: null,
    homeScore: null,
    awayScore: null,
    result: null,
    scoreTotal: null,
    meanSpread: null,
    meanTotal: null,
    homeWinProb: null,
    spreadLine: null,
    spreadModelProb: null,
    spreadMarketProb: null,
    spreadEdge: null,
    spreadHasPick: false,
    spreadOutcome: null,
    spreadClvPoints: null,
    spreadVerdictCall: null,
    totalLine: null,
    totalModelProb: null,
    totalMarketProb: null,
    totalEdge: null,
    totalHasPick: false,
    totalOutcome: null,
    totalClvPoints: null,
    mlModelProb: null,
    mlMarketProb: null,
    mlEdge: null,
    mlOutcome: null,
    homeSpreadOdds: null,
    awaySpreadOdds: null,
    snapshotCount: 1,
    ...over,
  };
}

describe("marginAccuracy", () => {
  it("averages absolute margin and total error for us and the book on the same games", () => {
    const a = marginAccuracy([
      g({ result: 10, scoreTotal: 50, meanSpread: 6, spreadLine: 3, meanTotal: 46, totalLine: 48 }),
      g({ result: -4, scoreTotal: 40, meanSpread: 2, spreadLine: -4, meanTotal: 44, totalLine: 42 }),
    ]);
    expect(a.margin).toEqual({ model: 5, book: 3.5, n: 2 });
    expect(a.total).toEqual({ model: 4, book: 2, n: 2 });
    expect(a.pick).toEqual({ right: 1, n: 2 });
    expect(a.within7).toEqual({ right: 2, n: 2 });
    expect(a.ats).toEqual({ right: 1, n: 2, pushes: 1 });
    expect(a.bias).toBe(1);
  });

  it("skips games without a final and counts a tie as a missed pick", () => {
    const a = marginAccuracy([
      g({ result: null, meanSpread: 3, spreadLine: 3 }),
      g({ result: 0, scoreTotal: 40, meanSpread: 3, spreadLine: 3, meanTotal: 41, totalLine: 41 }),
    ]);
    expect(a.margin?.n).toBe(1);
    expect(a.pick).toEqual({ right: 0, n: 1 });
    expect(a.within7).toEqual({ right: 1, n: 1 });
    expect(a.ats).toEqual({ right: 0, n: 1, pushes: 0 });
  });

  it("uses win probability for the pick and calls exactly 7 points within 7", () => {
    const a = marginAccuracy([
      g({ result: 10, meanSpread: 3, homeWinProb: 0.4, spreadLine: 3 }),
      g({ result: -4, meanSpread: -11.1, homeWinProb: 0.2, spreadLine: -3 }),
    ]);
    expect(a.pick).toEqual({ right: 1, n: 2 });
    expect(a.within7).toEqual({ right: 1, n: 2 });
  });

  it("returns nulls with no graded games", () => {
    const a = marginAccuracy([]);
    expect(a.margin).toBeNull();
    expect(a.total).toBeNull();
    expect(a.bias).toBeNull();
  });
});
