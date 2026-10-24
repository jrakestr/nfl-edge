import { describe, expect, it } from "vitest";
import type { WeekPlayer } from "@/lib/types";
import { profile } from "./construction";
import { asPointSource, projectionPoints, sourceObjective } from "./points";

function wp(partial: Partial<WeekPlayer> = {}): WeekPlayer {
  return {
    player_id: "00-love",
    display_name: "Jordan Love",
    position: "QB",
    team: "GB",
    game_id: "g1",
    fpts_dk_mean: 18,
    typical_dk: 18,
    hist: null,
    ...partial,
  };
}

describe("projectionPoints", () => {
  it("reads each players-table source and leaves a blank column blank", () => {
    const row = wp({ ngs_fpts: 21, fp_fpts: 16, mean_miss: 2, point_delta: -1 });
    expect(projectionPoints(row, "dk")).toBe(18);
    expect(projectionPoints(row, "ngs")).toBe(21);
    expect(projectionPoints(row, "fp")).toBe(16);
    expect(projectionPoints(row, "adjusted")).toBe(20);
    expect(projectionPoints(row, "yours")).toBe(19);
    expect(projectionPoints(wp({ mean_miss: null, point_delta: 4 }), "adjusted")).toBeNull();
    expect(projectionPoints(wp({ mean_miss: null, point_delta: 4 }), "yours")).toBeNull();
    expect(projectionPoints(wp(), "fp")).toBeNull();
  });

  it("treats an unknown query value as DK pts", () => {
    expect(asPointSource(null)).toBe("dk");
    expect(asPointSource("nope")).toBe("dk");
    expect(asPointSource("adjusted")).toBe("adjusted");
  });

  it("does not invent a ceiling for a non-sim source", () => {
    const single = profile("classic", "single");
    expect(sourceObjective(20, 0.25, single)).toBeCloseTo(20 - single.ownership_penalty * 0.25);
    expect(sourceObjective(20, null, profile("classic", "cash"))).toBe(20);
  });
});
