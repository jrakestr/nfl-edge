import { sql } from "@/lib/db";
import { type TeamInput } from "@/lib/team-input";

export type { TeamInput } from "@/lib/team-input";
export { inputsForMatchup, starterDiffers } from "@/lib/team-input";

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Per-team snapshot for a run. Empty when the table is missing or the run predates it. */
export async function teamInputsForRun(runId: string): Promise<Record<string, TeamInput>> {
  try {
    const rows = (await sql()`
      select t.team,
             t.off_ppd_raw::float8 as off_ppd_raw, t.off_ppd_adj::float8 as off_ppd_adj,
             t.def_ppd_allowed::float8 as def_ppd_allowed, t.drives_mean::float8 as drives_mean,
             t.league_off_ppd::float8 as league_off_ppd,
             t.league_def_ppd_allowed::float8 as league_def_ppd_allowed,
             t.qb_starter_id, t.qb_lookback_id,
             t.qb_lookback_att::float8 as qb_lookback_att,
             t.qb_starter_att::float8 as qb_starter_att,
             t.qb_pass_factor::float8 as qb_pass_factor,
             s.display_name as qb_starter_name,
             l.display_name as qb_lookback_name
      from model.run_team_inputs t
      left join raw.players s on s.gsis_id = t.qb_starter_id
      left join raw.players l on l.gsis_id = t.qb_lookback_id
      where t.run_id = ${runId}::uuid`) as Record<string, unknown>[];
    const out: Record<string, TeamInput> = {};
    for (const r of rows) {
      const team = String(r.team);
      out[team] = {
        team,
        off_ppd_raw: num(r.off_ppd_raw),
        off_ppd_adj: num(r.off_ppd_adj),
        def_ppd_allowed: num(r.def_ppd_allowed),
        drives_mean: num(r.drives_mean),
        league_off_ppd: num(r.league_off_ppd),
        league_def_ppd_allowed: num(r.league_def_ppd_allowed),
        qb_starter_id: (r.qb_starter_id as string | null) ?? null,
        qb_starter_name: (r.qb_starter_name as string | null) ?? null,
        qb_lookback_id: (r.qb_lookback_id as string | null) ?? null,
        qb_lookback_name: (r.qb_lookback_name as string | null) ?? null,
        qb_lookback_att: num(r.qb_lookback_att),
        qb_starter_att: num(r.qb_starter_att),
        qb_pass_factor: num(r.qb_pass_factor),
      };
    }
    return out;
  } catch {
    return {};
  }
}
