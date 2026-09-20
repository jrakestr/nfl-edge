import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONSTRUCTIONS,
  adjustedFpts,
  profile,
  profileDrift,
  toSolveControls,
  type ConstructionId,
} from "./construction";
import { DEFAULT_CLASSIC } from "./types";

const RAW = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../config/dfs/constructions.json"), "utf8"),
) as typeof CONSTRUCTIONS;

describe("construction profiles", () => {
  it("reads the same JSON the Python pipeline uses", () => {
    expect(CONSTRUCTIONS).toEqual(RAW);
  });

  it("loads Cash as floor with full cap and no stack", () => {
    const p = profile("classic", "cash");
    const c = toSolveControls("cash", p, DEFAULT_CLASSIC);
    expect(p.objective).toBe("floor");
    expect(p.floor_percentile).toBe(25);
    expect(c.randomness).toBe(0);
    expect(c.minSalary).toBe(49700);
    expect(c.lineups).toBe(1);
    expect(c.maxExposure).toBe(100);
    expect(c.stackN).toBe(0);
    expect(c.bringBack).toBe(0);
  });

  it("loads Single Entry as mean plus named ceiling and ownership weights", () => {
    const p = profile("classic", "single");
    expect(p.objective).toBe("mean_ceiling_own");
    expect(p.ceiling_weight).toBeGreaterThan(0);
    expect(p.ownership_penalty).toBeGreaterThan(0);
    expect(p.min_player_diff).toBe(2);
    expect(p.stack_n).toBe(1);
    expect(p.bring_back).toBe(1);
    expect(p.num_uniques).toBeNull();
    const fpts = adjustedFpts(10, 8, 14, 0.2, p);
    expect(fpts).toBeCloseTo(10 + p.ceiling_weight * 4 - p.ownership_penalty * 0.2);
  });

  it("loads Mass GPP as today's recipe", () => {
    const p = profile("classic", "mass");
    expect(p.randomness).toBe(25);
    expect(p.max_exposure).toBe(40);
    expect(p.num_uniques).toBe(3);
    expect(p.lineups).toBe(150);
  });

  it("rejects an unknown construction", () => {
    expect(() => profile("classic", "gpp" as ConstructionId)).toThrow(/construction/);
  });

  it("names controls that drifted from the selected profile", () => {
    const cash = toSolveControls("cash", profile("classic", "cash"), DEFAULT_CLASSIC);
    expect(profileDrift(cash, "classic")).toEqual([]);
    expect(profileDrift({ ...cash, minSalary: 40000, randomness: 10 }, "classic")).toEqual([
      "Min salary",
      "Random %",
    ]);
  });
});
