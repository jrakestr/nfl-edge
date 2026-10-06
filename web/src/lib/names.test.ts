import { describe, expect, it } from "vitest";
import { joinRoster, mergeKey, multiplierForStatus } from "./names";

const TEAMS = new Set(["MIN", "SF", "ATL", "DET"]);
const roster = [
  { gsis_id: "00-0033280", full_name: "Jalen Jennings", team: "MIN" },
  { gsis_id: "00-0033906", full_name: "Kyle Pitts", team: "ATL" },
];

describe("mergeKey", () => {
  it("strips suffix and punctuation", () => {
    expect(mergeKey("Kyle Pitts Sr.")).toBe("kyle pitts");
    expect(mergeKey("A.J. Brown")).toBe("aj brown");
  });
});

describe("joinRoster", () => {
  it("requires name and team; no name-only fallback", () => {
    const { matched, rejected } = joinRoster(
      [
        { player: "Jalen Jennings", team: "MIN", status: "out", channel: "all", confidence: "high" },
        { player: "Kyle Pitts Sr.", team: "ATL", status: "questionable", channel: "target_share", confidence: "medium" },
        { player: "Ghost", team: "SF", status: "out", channel: "all", confidence: "low" },
        { player: "Jalen Jennings", team: "SF", status: "out", channel: "all", confidence: "low" },
      ],
      roster,
      TEAMS,
    );
    expect(matched.map((m) => m.player_id)).toEqual(["00-0033280", "00-0033906"]);
    expect(matched[0]!.usage_multiplier).toBe(0);
    expect(matched[1]!.usage_multiplier).toBe(1);
    expect(rejected.map((r) => r.reason)).toEqual(["unmatched", "unmatched"]);
  });
});

describe("multiplierForStatus", () => {
  it("maps the closed set only", () => {
    expect(multiplierForStatus("out")).toBe(0);
    expect(multiplierForStatus("IR")).toBe(0);
    expect(multiplierForStatus("questionable")).toBe(1);
    expect(multiplierForStatus("70%")).toBeNull();
  });
});
