import { adjustedForMiss, checkPointEdit, editedPoints } from "./player-edit";

const edit = {
  season: 2026,
  week: 6,
  site: "dk",
  slate: "main",
  playerId: "00-0036322",
  delta: -1,
};

describe("adjustedForMiss", () => {
  it("adds his average miss to this week's sim", () => {
    expect(adjustedForMiss(18.4, 0.9)).toBeCloseTo(19.3);
    expect(adjustedForMiss(18.4, -2)).toBeCloseTo(16.4);
  });

  it("stays blank when the sim or the miss is missing", () => {
    expect(adjustedForMiss(null, 0.9)).toBeNull();
    expect(adjustedForMiss(18.4, null)).toBeNull();
    expect(adjustedForMiss(undefined, undefined)).toBeNull();
  });
});

describe("editedPoints", () => {
  it("moves Adjusted by whole points and returns null when Adjusted is missing", () => {
    expect(editedPoints(18.4, 0)).toBeCloseTo(18.4);
    expect(editedPoints(18.4, 1)).toBeCloseTo(19.4);
    expect(editedPoints(18.4, -2)).toBeCloseTo(16.4);
    expect(editedPoints(null, 1)).toBeNull();
    expect(editedPoints(undefined, 1)).toBeNull();
  });
});

describe("checkPointEdit", () => {
  it("accepts a one-point step", () => {
    expect(checkPointEdit(edit)).toBeNull();
  });

  it("rejects a step past 100 points", () => {
    expect(checkPointEdit({ ...edit, delta: 101 })).toMatch(/100/);
  });
});
