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

export type SourceWeights = {
  ours: number;
  fp: number;
  ngs: number;
};

/**
 * Inverse-MAE^2 weighted blend across available sources (Ours, FantasyPros, NFLGameSim).
 * Falls back to equal weights across present sources when `weights` is omitted, or null when
 * no source is present.
 */
export function blendPoints(
  sim: number | null | undefined,
  fp: number | null | undefined,
  ngs: number | null | undefined,
  weights?: SourceWeights | null,
): number | null {
  const wOurs = weights ? Math.max(0, weights.ours) : 1;
  const wFp = weights ? Math.max(0, weights.fp) : 1;
  const wNgs = weights ? Math.max(0, weights.ngs) : 1;
  let num = 0;
  let den = 0;
  if (sim != null && Number.isFinite(sim) && wOurs > 0) {
    num += wOurs * sim;
    den += wOurs;
  }
  if (fp != null && Number.isFinite(fp) && wFp > 0) {
    num += wFp * fp;
    den += wFp;
  }
  if (ngs != null && Number.isFinite(ngs) && wNgs > 0) {
    num += wNgs * ngs;
    den += wNgs;
  }
  if (den <= 0) return null;
  return num / den;
}

/** Null when the edit is one this table can save. */
export function checkPointEdit(input: PointEdit): string | null {
  if (!Number.isInteger(input.season) || input.season < 2000 || input.season > 2100) return "Bad season.";
  if (!Number.isInteger(input.week) || input.week < 1 || input.week > 22) return "Bad week.";
  if (input.site !== "dk") return "Bad site.";
  if (!/^[a-z0-9_-]{1,32}$/.test(input.slate)) return "Bad slate.";
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(input.playerId)) return "Bad player.";
  if (!Number.isInteger(input.delta) || input.delta < -100 || input.delta > 100) {
    return "That is more than 100 points from the sim.";
  }
  return null;
}
