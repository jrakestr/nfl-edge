import { crumbs } from "@/lib/breadcrumbs";

describe("crumbs", () => {
  it("labels /week/1/dfs/dk/main as Week 1 › Lineups › DK Main", () => {
    expect(crumbs("/week/1/dfs/dk/main").map((c) => c.label)).toEqual([
      "Week 1",
      "Lineups",
      "DK Main",
    ]);
  });

  it("labels players and optimize slates", () => {
    expect(crumbs("/week/1/players/dk/main").map((c) => c.label)).toEqual([
      "Week 1",
      "Players",
      "DK Main",
    ]);
    expect(crumbs("/week/1/optimize/dk/main").map((c) => c.label)).toEqual([
      "Week 1",
      "Optimize",
      "DK Main",
    ]);
  });

  it("labels /week/1/claims as Week 1 › Claims", () => {
    expect(crumbs("/week/1/claims").map((c) => c.label)).toEqual(["Week 1", "Claims"]);
  });

  it("labels /week/1/games as Week 1 › Games", () => {
    expect(crumbs("/week/1/games").map((c) => c.label)).toEqual(["Week 1", "Games"]);
  });

  it("skips Edge board on nested week routes", () => {
    expect(crumbs("/week/1").map((c) => c.label)).toEqual(["Week 1"]);
    expect(crumbs("/week").map((c) => c.label)).toEqual(["Edge board"]);
  });
});

describe("league crumbs", () => {
  it("labels /league as LOC league alone", () => {
    expect(crumbs("/league").map((c) => c.label)).toEqual(["LOC league"]);
  });

  it("labels sections, weeks, and teams without the NFL week prefix", () => {
    expect(crumbs("/league/luck").map((c) => c.label)).toEqual(["LOC league", "Luck"]);
    expect(crumbs("/league/weeks").map((c) => c.label)).toEqual(["LOC league", "Season"]);
    expect(crumbs("/league/week/4").map((c) => c.label)).toEqual(["LOC league", "Matchups", "Week 4"]);
    expect(crumbs("/league/team/15").map((c) => c.label)).toEqual(["LOC league", "Team 15"]);
    expect(crumbs("/league/transactions").map((c) => c.label)).toEqual(["LOC league", "Transactions"]);
    expect(crumbs("/league/wire").map((c) => c.label)).toEqual(["LOC league", "Wire"]);
    expect(crumbs("/league/acquire").map((c) => c.label)).toEqual(["LOC league", "Acquire"]);
  });
});
