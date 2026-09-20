import { describe, expect, it } from "vitest";
import { lineSourceLabel } from "./line-source";

describe("lineSourceLabel", () => {
  it("names DraftKings in plain words", () => {
    expect(lineSourceLabel("odds_api", "draftkings")).toBe("DraftKings");
  });

  it("does not show snake_case source names", () => {
    expect(lineSourceLabel("nflverse", null)).toBe("schedule lines");
    expect(lineSourceLabel("odds_api", "fanduel")).toBe("schedule lines");
    expect(lineSourceLabel(null, null)).toBe("schedule lines");
    expect(lineSourceLabel("odds_api", "draftkings")).not.toMatch(/odds_api|nflverse/);
  });
});
