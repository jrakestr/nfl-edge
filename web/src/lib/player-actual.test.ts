import { actualDisplay, signedPts } from "./player-actual";

describe("actualDisplay", () => {
  it("shows an em dash for both columns when the week is not graded", () => {
    expect(actualDisplay({ fpts_dk_mean: 12, actual_state: null })).toEqual({
      actual: "\u2014",
      diff: "\u2014",
      diffValue: null,
    });
    expect(actualDisplay({ fpts_dk_mean: 12 }).actual).toBe("\u2014");
  });

  it("shows DNP and no diff for a player without opportunity", () => {
    const d = actualDisplay({ fpts_dk_mean: 9, actual_dk: 0, actual_state: "dnp" });
    expect(d.actual).toBe("DNP");
    expect(d.diff).toBe("\u2014");
    expect(d.diffValue).toBeNull();
  });

  it("shows actual and actual minus projected, positive when the model was light", () => {
    const d = actualDisplay({ fpts_dk_mean: 12, actual_dk: 20.4, actual_state: "played" });
    expect(d.actual).toBe("20.4");
    expect(d.diff).toBe("+8.4");
    expect(d.diffValue).toBeCloseTo(8.4);
    expect(actualDisplay({ fpts_dk_mean: 15, actual_dk: 9, actual_state: "played" }).diff).toBe(
      "\u22126.0",
    );
  });

  it("has no diff when the player has no projection", () => {
    const d = actualDisplay({ fpts_dk_mean: null, actual_dk: 7, actual_state: "played" });
    expect(d.actual).toBe("7.0");
    expect(d.diff).toBe("\u2014");
  });
});

describe("signedPts", () => {
  it("never shows a signed zero", () => {
    expect(signedPts(0.04)).toBe("0.0");
    expect(signedPts(-0.04)).toBe("0.0");
  });
});
