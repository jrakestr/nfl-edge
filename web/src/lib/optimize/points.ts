import { adjustedForMiss, editedPoints } from "@/lib/player-edit";
import type { WeekPlayer } from "@/lib/types";
import type { ConstructionProfile } from "./construction";
import type { PointSource } from "./types";

export const POINT_SOURCES = ["dk", "blend", "ngs", "fp", "adjusted", "yours"] as const satisfies readonly PointSource[];

export const POINT_SOURCE_LABEL: Record<PointSource, string> = {
  dk: "DK pts",
  blend: "Blend",
  ngs: "NFLGameSim",
  fp: "FantasyPros",
  adjusted: "Adjusted",
  yours: "Yours",
};

export function asPointSource(raw: string | null): PointSource {
  if (raw === "blend" || raw === "ngs" || raw === "fp" || raw === "adjusted" || raw === "yours") return raw;
  return "dk";
}

/** The number that source shows on the players table. Null when that column is blank. */
export function projectionPoints(p: WeekPlayer, source: PointSource): number | null {
  if (source === "dk") return finite(p.fpts_dk_mean);
  if (source === "blend") return finite(p.blend_fpts);
  if (source === "ngs") return finite(p.ngs_fpts);
  if (source === "fp") return finite(p.fp_fpts);
  const adjusted = adjustedForMiss(p.fpts_dk_mean, p.mean_miss);
  if (source === "adjusted") return adjusted;
  return editedPoints(adjusted, p.point_delta ?? 0);
}

/**
 * Non-sim sources have no percentile. Cash uses the chosen number.
 * Single Entry still subtracts ownership and does not add the sim ceiling.
 */
export function sourceObjective(
  points: number,
  own: number | null,
  prof: ConstructionProfile,
): number {
  if (prof.objective === "mean_ceiling_own") {
    return points - prof.ownership_penalty * (own ?? 0);
  }
  return points;
}

function finite(n: number | null | undefined): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}
