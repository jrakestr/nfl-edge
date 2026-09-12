import { impliedFromLines, linesDiffer, simScore } from "./implied";

describe("impliedPoints", () => {
  it("splits a 48 / +6 home-favored line into 27–21", () => {
    expect(impliedFromLines(48, 6)).toEqual({ home: 27, away: 21 });
  });

  it("uses mean when present", () => {
    expect(simScore({ mean_total: 48, mean_spread: 6, fair_total: 47, fair_spread: 5 })).toEqual({
      home: 27,
      away: 21,
    });
  });

  it("detects a moved line and ignores a missing run market", () => {
    expect(linesDiffer(48, 3.5, 48, 3)).toBe(true);
    expect(linesDiffer(48, 3, 48, 3)).toBe(false);
    expect(linesDiffer(null, 3.5, 48, 3)).toBe(false);
  });
});
