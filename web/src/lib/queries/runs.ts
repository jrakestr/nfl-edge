import { sql } from "@/lib/db";
import { RunRowSchema, WeekRunsSchema, type RunRow, type WeekRuns } from "@/lib/types";

/** A run plus how many proj_games rows it wrote. Used to skip a partial Sunday sim. */
export type RunWithCount = RunRow & { n_games: number };

/** Lineups/Optimize: n_lineups is for one site+slate. */
export type RunWithLineups = RunWithCount & { n_lineups: number };

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

/** Scheduled games for the week — the full-slate size a sim must match. */
export async function slateGameCount(season: number, week: number): Promise<number> {
  const rows = await sql()`
    select count(*)::int as n from raw.schedules where season = ${season} and week = ${week}`;
  return rows[0]?.n ?? 0;
}

/** Runs for a week, newest first (feeds the RunBadge's run picker). */
export async function runsForWeek(season: number, week: number): Promise<RunWithCount[]> {
  const rows = await sql()`
    select r.run_id, r.season, r.week, r.created_at, r.draws_per_game, r.git_sha,
           (select count(*)::int from model.proj_games p where p.run_id = r.run_id) as n_games
    from model.sim_runs r
    where r.season = ${season} and r.week = ${week}
    order by created_at desc`;
  return rows.map((r) => {
    const parsed = RunRowSchema.parse(r);
    return { ...parsed, n_games: Number(r.n_games) };
  });
}

/**
 * Newest run whose proj_games count equals the week's schedule. A pinned id wins when
 * present; a missing pin or an empty full-slate set falls through. No full run → newest.
 */
export function pickDefaultRun<T extends { run_id: string; created_at: Date; n_games: number }>(
  runs: T[],
  slateGames: number,
  pinned?: string,
): T | null {
  if (runs.length === 0) return null;
  if (pinned) {
    const hit = runs.find((r) => r.run_id === pinned);
    if (hit) return hit;
  }
  const newest = (a: T, b: T) => b.created_at.getTime() - a.created_at.getTime();
  const full = slateGames > 0 ? runs.filter((r) => r.n_games === slateGames).sort(newest) : [];
  if (full.length) return full[0];
  return [...runs].sort(newest)[0];
}

/**
 * Lineups/Optimize: use the default run when it has lineups; otherwise the newest run
 * that has lineups for the slate. `buildInProgress` when the default run still has none.
 */
export function pickLineupRun<
  T extends { run_id: string; created_at: Date; n_games: number; n_lineups: number },
>(runs: T[], slateGames: number, pinned?: string): { run: T; buildInProgress: boolean } | null {
  const preferred = pickDefaultRun(runs, slateGames, pinned);
  if (!preferred) return null;
  if (preferred.n_lineups > 0) return { run: preferred, buildInProgress: false };
  const newest = (a: T, b: T) => b.created_at.getTime() - a.created_at.getTime();
  const withLineups = runs.filter((r) => r.n_lineups > 0).sort(newest);
  if (withLineups[0]) return { run: withLineups[0], buildInProgress: true };
  return { run: preferred, buildInProgress: false };
}

/** The run to display: pinned if present, else the newest full slate for the week. */
export async function runForWeek(season: number, week: number, runId?: string): Promise<RunRow | null> {
  const [runs, slateGames] = await Promise.all([runsForWeek(season, week), slateGameCount(season, week)]);
  return pickDefaultRun(runs, slateGames, runId);
}

export function newerRunExists(run: RunRow, runs: RunRow[]): boolean {
  return runs.some((r) => r.created_at > run.created_at);
}
