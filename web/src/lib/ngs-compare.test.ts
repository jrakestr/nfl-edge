import { compareWithSite, type SiteGame } from "@/lib/ngs-compare";
import { gameFlags } from "@/lib/margin-accuracy";
import type { GradedGame } from "@/lib/grade-types";

function ours(over: Partial<GradedGame>): GradedGame {
  return {
    gameId: "g1",
    week: 3,
    runId: "r",
    home: "GB",
    away: "ATL",
    gameday: "2026-09-24",
    gametime: "20:15",
    homeScore: 14,
    awayScore: 35,
    result: -21,
    scoreTotal: 49,
    meanSpread: 2,
    meanTotal: 45,
    homeWinProb: 0.55,
    spreadLine: 6,
    spreadModelProb: null,
    spreadMarketProb: null,
    spreadEdge: null,
    spreadHasPick: false,
    spreadOutcome: null,
    spreadClvPoints: null,
    spreadVerdictCall: null,
    totalLine: 44.5,
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

function site(over: Partial<SiteGame>): SiteGame {
  return {
    gameId: "g1",
    week: 3,
    home: "GB",
    away: "ATL",
    gameday: "2026-09-24",
    gametime: "20:15",
    status: "final",
    simMarginHome: 3.4,
    simPHomeWin: 0.6,
    pickResult: "incorrect",
    marginWithin7: "no",
    atsResult: "correct",
    actualMarginHome: -21,
    ...over,
  };
}

describe("gameFlags", () => {
  it("pick follows win probability, within 7 is inclusive, spread hit needs the right side of the line", () => {
    expect(gameFlags(ours({ result: 9, meanSpread: 2, spreadLine: 1 }))).toEqual({
      pick: "right",
      within7: true,
      ats: "hit",
    });
    expect(gameFlags(ours({ result: -21 }))).toEqual({ pick: "wrong", within7: false, ats: "hit" });
  });

  it("a tie is a push on the pick and an exact cover is a push on the spread", () => {
    const f = gameFlags(ours({ result: 6, meanSpread: 9, spreadLine: 6, homeWinProb: 0.5 }));
    expect(f?.ats).toBe("push");
    expect(gameFlags(ours({ result: 0 }))?.pick).toBe("push");
  });

  it("returns null with no final or no mean margin", () => {
    expect(gameFlags(ours({ result: null }))).toBeNull();
    expect(gameFlags(ours({ meanSpread: null }))).toBeNull();
  });
});

describe("compareWithSite", () => {
  const g2 = { gameId: "g2", home: "BUF", away: "LAC" };
  const siteRows = [
    site({}),
    site({ ...g2, simMarginHome: 11.5, pickResult: "correct", marginWithin7: "yes", atsResult: "correct", actualMarginHome: 8 }),
    site({ gameId: "g3", home: "DET", away: "NYJ", pickResult: "correct", marginWithin7: "no", atsResult: "incorrect", actualMarginHome: 10 }),
    site({ gameId: "g4", home: "KC", away: "DEN", status: "pending", pickResult: null, marginWithin7: null, atsResult: null, actualMarginHome: null }),
  ];

  it("counts every final site game; ours counts only games we graded; site-same matches ours", () => {
    const oursRows = [
      ours({}), // pick wrong (we liked home, away won by 21), within 7 no, spread hit (we leaned away)
      ours({ gameId: "g2", home: "BUF", away: "LAC", result: 8, meanSpread: 11.5, spreadLine: 7, homeWinProb: 0.8 }),
    ];
    const c = compareWithSite(oursRows, siteRows, 3);
    expect(c.site.pick).toEqual({ right: 2, n: 3 });
    expect(c.site.within7).toEqual({ right: 1, n: 3 });
    expect(c.site.ats).toEqual({ right: 2, n: 3, pushes: 0 });
    expect(c.ours.pick).toEqual({ right: 1, n: 2 });
    expect(c.ours.within7).toEqual({ right: 1, n: 2 });
    expect(c.ours.ats).toEqual({ right: 2, n: 2, pushes: 0 });
    expect(c.siteSame.pick).toEqual({ right: 1, n: 2 });
    expect(c.siteSame.ats).toEqual({ right: 2, n: 2, pushes: 0 });
    expect(c.ungraded).toBe(1);
  });

  it("lists each final site game with a null ours when we have no graded run", () => {
    const c = compareWithSite([ours({})], siteRows, 3);
    expect(c.games.map((g) => g.gameId)).toEqual(["g1", "g2", "g3"]);
    expect(c.games[0].ours?.pick).toBe("wrong");
    expect(c.games[1].ours).toBeNull();
    expect(c.games[1].siteMargin).toBe(11.5);
    expect(c.games[0].ourMargin).toBe(2);
  });

  it("filters to the week, and null means every week", () => {
    const w1 = site({ gameId: "w1", week: 1, pickResult: "correct" });
    expect(compareWithSite([], [...siteRows, w1], 1).site.pick.n).toBe(1);
    expect(compareWithSite([], [...siteRows, w1], null).site.pick.n).toBe(4);
  });
});
