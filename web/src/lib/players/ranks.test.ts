import { positionRanks } from "./ranks";

describe("positionRanks", () => {
  it("ranks 1 as highest within a position and ignores other positions", () => {
    const rows = [
      { position: "WR", val: 12 },
      { position: "WR", val: 20 },
      { position: "RB", val: 18 },
      { position: "WR", val: 8 },
    ];
    expect(positionRanks(rows, (r) => r.position, (r) => r.val)).toEqual([2, 1, 1, 3]);
  });

  it("leaves null when the metric or position is missing", () => {
    const rows = [
      { position: "QB", val: 22 },
      { position: "QB", val: null },
      { position: "FLEX", val: 10 },
      { position: null, val: 9 },
    ];
    expect(positionRanks(rows, (r) => r.position, (r) => r.val)).toEqual([1, null, null, null]);
  });
});
