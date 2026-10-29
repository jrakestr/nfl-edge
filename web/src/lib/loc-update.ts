/**
 * Input rules for the LOC page "Update LOC stats" button. SQL-free.
 * The button asks GitHub to run loc.yml (`nfl-edge ingest espn-league`). The scheduled
 * Refresh phase runs that same full pull daily.
 */

export function locDispatchInputs(season: unknown): { ok: true; season: string } | { ok: false; error: string } {
  const n = typeof season === "number" ? season : Number(String(season ?? "").trim());
  if (!Number.isInteger(n) || n < 2000 || n > 2100) return { ok: false, error: "Season must be a year" };
  return { ok: true, season: String(n) };
}
