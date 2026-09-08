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

  it("skips Edge board on nested week routes", () => {
    expect(crumbs("/week/1").map((c) => c.label)).toEqual(["Week 1"]);
    expect(crumbs("/week").map((c) => c.label)).toEqual(["Edge board"]);
  });
});
