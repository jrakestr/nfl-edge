import {
  chalk,
  contestRows,
  drawerBreakdown,
  entryFor,
  lowOwnedHits,
  portfolio,
  ptsPerK,
  topScorers,
  type ContestPlayer,
  type ReviewFact,
  type ReviewLineup,
} from "@/lib/review";

const fact = (over: Partial<ReviewFact> & { name: string }): ReviewFact => ({
  playerId: over.name,
  team: "KC",
  position: "WR",
  salary: 5000,
  proj: 10,
  sd: 5,
  p10: 3,
  p90: 20,
  boom: 0.2,
  bust: 0.3,
  top1Pct: 0.05,
  ownOurs: 0.2,
  ownFieldSim: 0.1,
  actual: 10,
  ...over,
});

const lineup = (names: string[], over: Partial<ReviewLineup> = {}): ReviewLineup => ({
  id: "1",
  stack: null,
  salary: 50000,
  proj: 100,
  actual: 100,
  winPct: 0.1,
  slots: names.map((name, i) => ({ slot: `S${i}`, name, dkId: null, playerId: name })),
  entries: [],
  ...over,
});

describe("ptsPerK", () => {
  it("divides by salary over 1000", () => {
    expect(ptsPerK(30, 6000)).toBe(5);
    expect(ptsPerK(null, 6000)).toBeNull();
    expect(ptsPerK(10, 0)).toBeNull();
  });
});

describe("portfolio", () => {
  const contest = { top1Score: 150, cashScore: 130 };
  const lus = [
    { actual: 160, proj: 120 },
    { actual: 131, proj: 110 },
    { actual: 100, proj: 100 },
    { actual: null, proj: 90 },
  ];
  it("summarizes graded lineups and counts incomplete", () => {
    const p = portfolio(lus, contest);
    expect(p).toMatchObject({ graded: 3, incomplete: 1, best: 160, worst: 100, median: 131 });
    expect(p.meanActual).toBeCloseTo(130.33, 2);
    expect(p.meanProj).toBeCloseTo(110, 5);
    expect(p.top1Count).toBe(1);
    expect(p.cashCount).toBe(2);
  });
  it("leaves top 1% and cash blank without a contest", () => {
    const p = portfolio(lus, null);
    expect(p.top1Count).toBeNull();
    expect(p.cashCount).toBeNull();
  });
  it("is empty with no graded lineups", () => {
    const p = portfolio([{ actual: null, proj: 1 }], contest);
    expect(p.best).toBeNull();
    expect(p.median).toBeNull();
  });
});

describe("contest panels", () => {
  const players: ContestPlayer[] = [
    { name: "A", position: "WR", own: 0.4, top1Rate: 0.5, fpts: 10 },
    { name: "B", position: "RB", own: 0.05, top1Rate: 0.2, fpts: 24 },
    { name: "C", position: "RB", own: 0.09, top1Rate: 0.1, fpts: 12 },
    { name: "D", position: "TE", own: 0.2, top1Rate: 0.1, fpts: 30 },
    { name: "E", position: "QB", own: 0.02, top1Rate: 0.0, fpts: 30 },
  ];
  const facts = [
    fact({ name: "A", salary: 8000 }),
    fact({ name: "B", salary: 6000 }),
    fact({ name: "C", salary: 5000 }),
    fact({ name: "D", salary: 4000 }),
    fact({ name: "E", salary: 12000 }),
  ];
  const rows = contestRows(players, facts);
  it("chalk is most owned first", () => {
    expect(chalk(rows).map((r) => r.name)).toEqual(["A", "D", "C", "B", "E"]);
  });
  it("low-owned hits need <10% own and 3 pts per $1k, points descending", () => {
    // B 4.0/k, C 2.4/k (out), E 2.5/k (out); D is 20% owned (out)
    expect(lowOwnedHits(rows).map((r) => r.name)).toEqual(["B"]);
  });
  it("caps panels at 15", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `P${i}`,
      position: "WR",
      team: null,
      salary: 1000,
      own: 0.01,
      top1Rate: null,
      pts: 20 + i,
      ptsPerK: 20 + i,
    }));
    expect(chalk(many)).toHaveLength(15);
    expect(lowOwnedHits(many)).toHaveLength(15);
    expect(lowOwnedHits(many)[0]!.name).toBe("P29");
  });
});

describe("topScorers", () => {
  it("ranks by actual, flags players in none of our lineups, falls back to contest FPTS for DST", () => {
    const facts = [
      fact({ name: "Star", actual: 40 }),
      fact({ name: "Ours", actual: 30 }),
      fact({ name: "Chiefs", position: "DST", actual: null }),
      fact({ name: "Nobody", actual: null }),
    ];
    const contest: ContestPlayer[] = [{ name: "Chiefs", position: "DST", own: 0.12, top1Rate: null, fpts: 35 }];
    const rows = topScorers(facts, contest, [lineup(["Ours", "Chiefs"])]);
    expect(rows.map((r) => r.name)).toEqual(["Star", "Chiefs", "Ours"]);
    expect(rows.find((r) => r.name === "Star")!.missed).toBe(true);
    expect(rows.find((r) => r.name === "Ours")!.ours).toBe(1);
    expect(rows.find((r) => r.name === "Chiefs")!.contestOwn).toBe(0.12);
    expect(rows.find((r) => r.name === "Ours")!.contestOwn).toBeNull();
  });
});

describe("drawerBreakdown", () => {
  const names = ["a", "b", "c"];
  const facts = names.map((n) => fact({ name: n, ownOurs: 0.3, ownFieldSim: 0.1 }));
  const contest: ContestPlayer[] = [
    { name: "a", position: null, own: 0.1, top1Rate: null, fpts: 10.25 },
    { name: "b", position: null, own: 0.2, top1Rate: null, fpts: 20 },
    { name: "c", position: null, own: 0.5, top1Rate: null, fpts: 5.5 },
  ];
  it("sums contest FPTS and computes both leverages", () => {
    const b = drawerBreakdown(lineup(names), facts, contest);
    expect(b.total).toBe(35.75);
    expect(b.missing).toEqual([]);
    expect(b.slots[0]!.leverage).toBeCloseTo(0.2, 5);
    expect(b.slots[0]!.contestLeverage).toBeCloseTo(0.2, 5);
    expect(b.slots[2]!.contestLeverage).toBeCloseTo(-0.2, 5);
    expect(b.slots[0]).toMatchObject({ ceiling: 20, floor: 3, sd: 5, boom: 0.2, bust: 0.3, top1Pct: 0.05 });
  });
  it("withholds the total and names the miss when a slot has no FPTS", () => {
    const b = drawerBreakdown(lineup(names), facts, contest.slice(0, 2));
    expect(b.total).toBeNull();
    expect(b.missing).toEqual(["c"]);
  });
  it("leaves contest values empty without a file", () => {
    const b = drawerBreakdown(lineup(names), facts, null);
    expect(b.total).toBeNull();
    expect(b.slots[0]!.fpts).toBeNull();
    expect(b.slots[0]!.contestLeverage).toBeNull();
    expect(b.slots[0]!.leverage).toBeCloseTo(0.2, 5);
  });
  it("shows null sim rates as empty when never stored", () => {
    const old = [fact({ name: "a", p10: null, p90: null, boom: null, bust: null })];
    const b = drawerBreakdown(lineup(["a"]), old, null);
    expect(b.slots[0]).toMatchObject({ ceiling: null, floor: null, boom: null, bust: null });
  });
});

describe("entryFor", () => {
  it("takes the best rank for the contest", () => {
    const l = lineup([], {
      entries: [
        { contestKey: 1, rank: 500, points: 100, cashed: false, winnings: 0 },
        { contestKey: 1, rank: 20, points: 120, cashed: true, winnings: 5 },
        { contestKey: 2, rank: 1, points: 200, cashed: true, winnings: 9 },
      ],
    });
    expect(entryFor(l, 1)!.rank).toBe(20);
    expect(entryFor(l, 3)).toBeNull();
    expect(entryFor(l, null)).toBeNull();
  });
});
