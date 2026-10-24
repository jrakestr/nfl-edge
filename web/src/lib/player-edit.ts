/** Display math for the players table. Nothing here is written back into the sim. */

export type PointEdit = {
  season: number;
  week: number;
  site: string;
  slate: string;
  playerId: string;
  delta: number;
};

/** This week's sim plus his average miss from earlier weeks. Blank when either number is missing. */
export function adjustedForMiss(
  sim: number | null | undefined,
  meanMiss: number | null | undefined,
): number | null {
  if (sim == null || meanMiss == null) return null;
  if (!Number.isFinite(sim) || !Number.isFinite(meanMiss)) return null;
  return sim + meanMiss;
}

/** The copy of Adjusted after the plus and minus steps. One step is one point. */
export function editedPoints(
  adjusted: number | null | undefined,
  delta: number,
): number | null {
  if (adjusted == null || !Number.isFinite(adjusted) || !Number.isFinite(delta)) return null;
  return adjusted + delta;
}

/** Null when the edit is one this table can save. */
export function checkPointEdit(input: PointEdit): string | null {
  if (!Number.isInteger(input.season) || input.season < 2000 || input.season > 2100) return "Bad season.";
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 22) return "Bad week.";
  if (input.site !== "dk" && input.site !== "fd") return "Bad site.";
  if (!/^[a-z0-9_-]{1,32}$/.test(input.slate)) return "Bad slate.";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.playerId)) return "Bad player.";
  if (!Number.isInteger(input.delta) || input.delta < -100 || input.delta > 100) {
    return "That is more than 100 points from the sim.";
  }
  return null;
}
