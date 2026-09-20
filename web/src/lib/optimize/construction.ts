import raw from "../../../../config/dfs/constructions.json";
import { DEFAULT_CLASSIC, type SolveControls } from "./types";

export type ConstructionId = "cash" | "single" | "mass";
export type SlateKind = "classic" | "showdown";
export type ObjectiveId = "floor" | "mean_ceiling_own" | "jittered_mean";

export type ConstructionProfile = {
  objective: ObjectiveId;
  floor_percentile: number;
  ceiling_weight: number;
  ownership_penalty: number;
  randomness: number;
  min_lineup_salary: number;
  lineups: number;
  lineups_max: number;
  max_exposure: number;
  num_uniques: number | null;
  min_player_diff: number;
  stack_n: number;
  bring_back: number;
  no_qb_vs_dst: boolean;
};

export const CONSTRUCTIONS = raw as Record<SlateKind, Record<ConstructionId, ConstructionProfile>>;

export const CONSTRUCTION_LABEL: Record<ConstructionId, string> = {
  cash: "Cash",
  single: "Single Entry",
  mass: "Mass GPP",
};

export function profile(slate: SlateKind, construction: ConstructionId): ConstructionProfile {
  const row = CONSTRUCTIONS[slate]?.[construction];
  if (!row) throw new Error(`unknown construction ${construction} for ${slate}`);
  return row;
}

export function toSolveControls(
  prof: ConstructionProfile,
  base: SolveControls = DEFAULT_CLASSIC,
): SolveControls {
  return {
    ...base,
    lineups: prof.lineups,
    minSalary: prof.min_lineup_salary,
    maxExposure: prof.max_exposure,
    randomness: prof.randomness,
    stackN: prof.stack_n,
    bringBack: prof.bring_back,
    noQbVsDst: prof.no_qb_vs_dst,
    requireStack: prof.stack_n > 0,
  };
}

export function adjustedFpts(
  mean: number,
  p25: number | null,
  p90: number | null,
  own: number | null,
  prof: ConstructionProfile,
): number {
  if (prof.objective === "floor") {
    if (p25 == null) throw new Error("This run has no 25th-percentile points; rebuild the sim.");
    return p25;
  }
  if (prof.objective === "mean_ceiling_own") {
    const ceil = p90 == null ? 0 : p90 - mean;
    return mean + prof.ceiling_weight * ceil - prof.ownership_penalty * (own ?? 0);
  }
  return mean;
}
