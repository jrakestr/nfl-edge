/** Live override status for the Players library and Lineup cards. Not the sim row. */

export type OverrideStatus = "out" | "doubtful" | "questionable" | "active" | string | null | undefined;

const PILL: Record<string, "OUT" | "D" | "Q"> = {
  out: "OUT",
  ir: "OUT",
  doubtful: "D",
  questionable: "Q",
};

export function statusPill(status: OverrideStatus): "OUT" | "D" | "Q" | null {
  if (status == null || status === "") return null;
  return PILL[String(status).trim().toLowerCase()] ?? null;
}

/** OUT or D set after the live run. Q never greys. */
export function staleInjury(
  status: OverrideStatus,
  updatedAt: Date | string | null | undefined,
  runCreatedAt: Date | string | null | undefined,
): boolean {
  const pill = statusPill(status);
  if (pill !== "OUT" && pill !== "D") return false;
  if (updatedAt == null || runCreatedAt == null) return false;
  return new Date(updatedAt).getTime() > new Date(runCreatedAt).getTime();
}

export const REBUILD_PENDING = "projected before injury report; rebuild pending";

export function inOptimizerPool(
  status: OverrideStatus,
  updatedAt: Date | string | null | undefined,
  runCreatedAt: Date | string | null | undefined,
): boolean {
  return !staleInjury(status, updatedAt, runCreatedAt);
}
