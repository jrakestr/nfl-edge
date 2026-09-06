import { sql } from "@/lib/db";
import { RunRowSchema, WeekRunsSchema, type RunRow, type WeekRuns } from "@/lib/types";

/** Weeks of a season that have at least one sim run, newest week first. */
export async function weeksWithRuns(season: number): Promise<WeekRuns[]> {
  const rows = await sql()`
    select distinct on (week) week, run_id as newest_run_id, created_at,
           count(*) over (partition by week)::int as runs
    from model.sim_runs
    where season = ${season}
    order by week desc, created_at desc`;
  return rows.map((r) => WeekRunsSchema.parse(r));
}

/** Newest week with a run, or null when the season has none yet. */
export async function newestWeek(season: number): Promise<number | null> {
  const rows = await sql()`select max(week)::int as week from model.sim_runs where season = ${season}`;
  return rows[0]?.week ?? null;
}

/** Runs for a week, newest first (feeds the RunBadge's run picker). */
export async function runsForWeek(season: number, week: number): Promise<RunRow[]> {
  const rows = await sql()`
    select run_id, season, week, created_at, draws_per_game, git_sha
    from model.sim_runs
    where season = ${season} and week = ${week}
    order by created_at desc`;
  return rows.map((r) => RunRowSchema.parse(r));
}

/** The run to display: `runId` when pinned and present, else the newest for the week. */
export async function runForWeek(season: number, week: number, runId?: string): Promise<RunRow | null> {
  const runs = await runsForWeek(season, week);
  if (runs.length === 0) return null;
  if (runId) return runs.find((r) => r.run_id === runId) ?? runs[0];
  return runs[0];
}

export function newerRunExists(run: RunRow, runs: RunRow[]): boolean {
  return runs.some((r) => r.created_at > run.created_at);
}
