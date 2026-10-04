import {
  gateText,
  groupByDimension,
  resid,
  residPct,
  weeksMissing,
  type BiasCell,
} from "./player-bias";

function cell(over: Partial<BiasCell>): BiasCell {
  return {
    ord: 0,
    dimension: "position",
    label: "WR",
    n: 40,
    projected: 8,
    actual: 9,
    meanResid: 1,
    meanPct: 12.5,
    mae: 4,
    se: 0.4,
    weeksGraded: 2,
    state: "candidate",
    reason: "same sign every week, beyond one standard error",
    owner: null,
    ...over,
  };
}

describe("gateText", () => {
  it("says plainly when a cell passes", () => {
    expect(gateText(cell({}))).toBe("Passes the gate");
  });

  it("names the reason when evidence is thin", () => {
    expect(gateText(cell({ state: "not enough evidence", reason: "only 29 players, need 30" }))).toBe(
      "Not enough evidence. Only 29 players, need 30",
    );
  });

  it("never shows a snake_case identifier", () => {
    const t = gateText(cell({ state: "not enough evidence", reason: "residual sign differs between weeks" }));
    expect(t).not.toMatch(/[a-z]+_[a-z]+/);
  });
});

describe("groupByDimension", () => {
  it("keeps database order and titles each group", () => {
    const g = groupByDimension([
      cell({ ord: 2, dimension: "tier", label: "star" }),
      cell({ ord: 0, dimension: "position", label: "QB" }),
      cell({ ord: 1, dimension: "position", label: "RB" }),
    ]);
    expect(g.map((x) => x.title)).toEqual(["By position", "By projection tier"]);
    expect(g[0]!.cells.map((c) => c.label)).toEqual(["QB", "RB"]);
  });
});

describe("number display", () => {
  it("uses a true minus, explicit plus, and an em dash for missing values", () => {
    expect(resid(0.4)).toBe("+0.40");
    expect(resid(-0.5)).toBe("\u22120.50");
    expect(resid(null)).toBe("\u2014");
    expect(residPct(8.6)).toBe("+8.6%");
    expect(residPct(null)).toBe("\u2014");
  });
});

describe("weeksMissing", () => {
  it("lists graded weeks with no player comparison", () => {
    expect(weeksMissing([1, 2], [1, 2, 3, 4])).toEqual([3, 4]);
    expect(weeksMissing([1, 2], [1, 2])).toEqual([]);
  });
});
