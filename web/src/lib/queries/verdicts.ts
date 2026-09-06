import { sql } from "@/lib/db";
import { VerdictRowSchema, type VerdictRow } from "@/lib/types";

/**
 * One verdict per game for a run, at each game's newest market snapshot
 * (`model.verdicts_latest`, migration 0005). Sorted by payload.max_edge desc;
 * `fail` rows sink to the bottom regardless of edge.
 */
export async function verdictsForRun(runId: string): Promise<VerdictRow[]> {
  const rows = await sql()`
    select game_id, market_line_id::int as market_line_id, payload
    from model.verdicts_latest
    where run_id = ${runId}::uuid`;
  return sortVerdicts(rows.map((r) => VerdictRowSchema.parse(r)));
}

export function sortVerdicts(rows: VerdictRow[]): VerdictRow[] {
  return [...rows].sort((a, b) => {
    const fa = a.payload.status === "fail" ? 1 : 0;
    const fb = b.payload.status === "fail" ? 1 : 0;
    if (fa !== fb) return fa - fb;
    return b.payload.max_edge - a.payload.max_edge;
  });
}
