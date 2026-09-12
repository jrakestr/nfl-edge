import { sql } from "@/lib/db";
import {
  CorrPairSchema,
  DfsExposureSchema,
  DfsLineupSchema,
  type CorrPair,
  type DfsExposure,
  type DfsLineup,
} from "@/lib/types";

export function slateId(season: number, week: number, slate: string): string {
  return `${season}_${String(week).padStart(2, "0")}_${slate}`;
}

/** Distinct ingested slate keys for the week (main first). Not a hardcoded trio. */
export async function slatesForWeek(season: number, week: number, site: string): Promise<string[]> {
  const rows = await sql()`
    select slate from (
      select distinct substring(slate_id from '^[0-9]+_[0-9]+_(.+)$') as slate
      from raw.dk_salaries
      where site = ${site}
        and split_part(slate_id, '_', 1)::int = ${season}
        and split_part(slate_id, '_', 2)::int = ${week}
    ) s
    where slate is not null
    order by case when slate = 'main' then 0 else 1 end, slate`;
  return rows.map((r) => String(r.slate));
}

/** Distinct DK game_info strings for this slate (used to filter the week's games). */
export async function slateGameInfos(site: string, slateId: string): Promise<string[]> {
  const rows = await sql()`
    select distinct game_info
    from raw.dk_salaries
    where site = ${site} and slate_id = ${slateId} and game_info is not null`;
  return rows.map((r) => String(r.game_info));
}

export async function dfsLineups(runId: string, site: string, slateId: string): Promise<DfsLineup[]> {
  const rows = await sql()`
    select lineup_id, salary_used, stack,
           proj_fpts::float8 as proj_fpts,
           sim_win_pct::float8 as sim_win_pct,
           sim_roi::float8 as sim_roi,
           lineup
    from model.dfs_lineups
    where run_id = ${runId}::uuid and site = ${site} and slate_id = ${slateId}
    order by sim_win_pct desc nulls last, proj_fpts desc nulls last, lineup_id`;
  return rows.map((r) => {
    const lu = (r.lineup ?? {}) as { players?: unknown };
    return DfsLineupSchema.parse({
      lineup_id: String(r.lineup_id),
      salary_used: r.salary_used ?? null,
      stack: r.stack ?? null,
      proj_fpts: r.proj_fpts ?? null,
      sim_win_pct: r.sim_win_pct ?? null,
      sim_roi: r.sim_roi ?? null,
      players: lu.players ?? [],
    });
  });
}

export async function dfsExposure(runId: string, site: string, slateId: string): Promise<DfsExposure[]> {
  const rows = await sql()`
    select e.player_id,
           coalesce(p.display_name, e.player_id) as name,
           coalesce(pp.team, s.team) as team,
           e.sim_own::float8 as sim_own,
           e.proj_own::float8 as proj_own,
           e.leverage::float8 as leverage
    from model.dfs_exposure e
    left join raw.players p on p.gsis_id = e.player_id
    left join model.proj_players pp on pp.run_id = e.run_id and pp.player_id = e.player_id
    left join (
      select distinct on (site, slate_id, player_id) site, slate_id, player_id, team
      from raw.dk_salaries
      where site = ${site} and slate_id = ${slateId}
      order by site, slate_id, player_id, (roster_position = 'FLEX') desc
    ) s
      on s.site = e.site and s.slate_id = e.slate_id and s.player_id = e.player_id
    where e.run_id = ${runId}::uuid and e.site = ${site} and e.slate_id = ${slateId}
    order by e.leverage desc nulls last, e.sim_own desc nulls last`;
  return rows.map((r) => DfsExposureSchema.parse(r));
}

/** Highest DK-point correlations among players we actually exposed. Display only. */
export async function stackCorrelations(
  runId: string,
  site: string,
  slateId: string,
): Promise<CorrPair[]> {
  const rows = await sql()`
    with exposed as (
      select player_id from model.dfs_exposure
      where run_id = ${runId}::uuid and site = ${site} and slate_id = ${slateId}
        and sim_own is not null and sim_own >= 0.2
    )
    select coalesce(pa.display_name, c.player_id_a) as a,
           coalesce(pb.display_name, c.player_id_b) as b,
           c.corr_dk::float8 as corr
    from model.player_correlations c
    join exposed ea on ea.player_id = c.player_id_a
    join exposed eb on eb.player_id = c.player_id_b
    left join raw.players pa on pa.gsis_id = c.player_id_a
    left join raw.players pb on pb.gsis_id = c.player_id_b
    where c.run_id = ${runId}::uuid and c.corr_dk is not null
    order by c.corr_dk desc
    limit 8`;
  return rows.map((r) => CorrPairSchema.parse(r));
}

export async function salaryTeams(site: string, slateId: string): Promise<Record<string, string>> {
  const lookup = await salaryLookup(site, slateId);
  const out: Record<string, string> = {};
  for (const [name, row] of Object.entries(lookup)) out[name] = row.team;
  return out;
}

export type SalaryLookup = { team: string; position: string };

/** Name → team + real position. Prefers the non-FLEX roster row when DK duplicates a player. */
export async function salaryLookup(site: string, slateId: string): Promise<Record<string, SalaryLookup>> {
  const rows = await sql()`
    select distinct on (lower(name)) name, team, position
    from raw.dk_salaries
    where site = ${site} and slate_id = ${slateId} and name is not null
    order by lower(name), case when roster_position = 'FLEX' then 1 else 0 end`;
  const out: Record<string, SalaryLookup> = {};
  for (const r of rows) {
    if (!r.name) continue;
    out[String(r.name).toLowerCase()] = {
      team: r.team != null ? String(r.team) : "",
      position: r.position != null ? String(r.position) : "",
    };
  }
  return out;
}

export function salaryPositions(lookup: Record<string, SalaryLookup>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, row] of Object.entries(lookup)) {
    if (row.position) out[name] = row.position;
  }
  return out;
}
