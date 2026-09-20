/** Settings persisted on weekly DFS lineups. Absent on runs before the cap existed. */

export type DfsBuildSettings = {
  randomness: number;
  stacksPct: number;
  maxExposure: number;
  numUniques?: number;
};

export function settingsLabels(settings: DfsBuildSettings | null | undefined): string[] {
  if (!settings) {
    return ["Randomness —", "Stacks % —", "Max exposure —"];
  }
  return [
    `Randomness ${settings.randomness}`,
    `Stacks ${settings.stacksPct}%`,
    `Max exposure ${settings.maxExposure}%`,
  ];
}

export function settingsFromLineup(raw: unknown): DfsBuildSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const s = (raw as { settings?: unknown }).settings;
  if (!s || typeof s !== "object") return null;
  const o = s as Record<string, unknown>;
  const randomness = Number(o.randomness);
  const stacksPct = Number(o.stacks_pct ?? o.stacksPct);
  const maxExposure = Number(o.max_exposure ?? o.maxExposure);
  if (![randomness, stacksPct, maxExposure].every((n) => Number.isFinite(n))) return null;
  const numUniques = Number(o.num_uniques ?? o.numUniques);
  return {
    randomness,
    stacksPct,
    maxExposure,
    ...(Number.isFinite(numUniques) ? { numUniques } : {}),
  };
}
