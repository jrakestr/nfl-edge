import { calibrationBucketsFrom, newestPredatedRunByGame, outcomeLabel } from "./grade-select";

describe("newestPredatedRunByGame", () => {
  it("two last-snapshot runs for one game returns only the predated run", () => {
    const rows = [
      { gameId: "2026_01_DAL_NYG", runId: "hindsight", predatedKickoff: false, createdAt: "2026-09-14T12:00:00Z" },
      { gameId: "2026_01_DAL_NYG", runId: "live", predatedKickoff: true, createdAt: "2026-09-13T15:00:00Z" },
    ];
    const got = newestPredatedRunByGame(rows);
    expect(got).toHaveLength(1);
    expect(got[0].runId).toBe("live");
  });

  it("two predated runs keeps the newest created_at", () => {
    const rows = [
      { gameId: "g1", runId: "old", predatedKickoff: true, createdAt: "2026-09-08T00:00:00Z" },
      { gameId: "g1", runId: "new", predatedKickoff: true, createdAt: "2026-09-13T15:00:00Z" },
    ];
    expect(newestPredatedRunByGame(rows)[0].runId).toBe("new");
  });
});

describe("calibrationBucketsFrom", () => {
  it("uses home/over only, drops picks-by-edge and pushes", () => {
    const rows = [
      { modelProb: 0.55, outcome: 1, marketType: "spread", side: "home" },
      { modelProb: 0.45, outcome: 0, marketType: "spread", side: "away" },
      { modelProb: 0.62, outcome: null, marketType: "total", side: "over" },
      { modelProb: 0.71, outcome: 1, marketType: "total", side: "over" },
      { modelProb: 0.22, outcome: 0, marketType: "moneyline", side: "home" },
    ];
    const all = calibrationBucketsFrom(rows);
    const n = all.reduce((s, b) => s + b.n, 0);
    expect(n).toBe(3);
    expect(all[5].n).toBe(1);
    expect(all[5].hitRate).toBe(1);
    expect(all[7].n).toBe(1);
    expect(all[2].n).toBe(1);
    expect(all[2].hitRate).toBe(0);
    const totals = calibrationBucketsFrom(rows, "total");
    expect(totals.reduce((s, b) => s + b.n, 0)).toBe(1);
  });
});

describe("outcomeLabel", () => {
  it("maps persisted outcome", () => {
    expect(outcomeLabel(1)).toBe("Won");
    expect(outcomeLabel(0)).toBe("Lost");
    expect(outcomeLabel(null)).toBe("Push");
  });
});
