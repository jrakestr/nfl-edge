import { sql } from "@/lib/db";
import type {
  ContestPlayer,
  ReviewContest,
  ReviewData,
  ReviewEntry,
  ReviewFact,
  ReviewLineup,
  ReviewSlot,
} from "@/lib/review";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Newest run for the slate that has graded mass lineups. Null means scores are unpublished
 * (grade skipped) and the page shows its empty state.
 */
export async function gradedRun(
  site: string,
  slateId: string,
): Promise<{ runId: string; total: number } | null> {
  const rows = await sql()`
    select run_id, count(*)::int as total, max(created_at) as created_at
    from model.dfs_lineups
    where construction = 'mass' and site = ${site} and slate_id = ${slateId}
    group by run_id
    having count(actual_fpts) > 0
    order by max(created_at) desc
    limit 1`;
  const r = rows[0];
  return r ? { runId: String(r.run_id), total: Number(r.total) } : null;
}

/** Newest week of the season with graded mass lineups for the site's Main slate. Null when none. */
export async function latestGradedWeek(season: number, site: string): Promise<number | null> {
  const rows = await sql()`
    select slate_id
    from model.dfs_lineups
    where construction = 'mass' and site = ${site}
      and slate_id like ${`${season}\\_%\\_main`}
    group by slate_id
    having count(actual_fpts) > 0
    order by slate_id desc
    limit 1`;
  const m = /^\d+_(\d+)_main$/.exec(String(rows[0]?.slate_id ?? ""));
  return m ? Number(m[1]) : null;
}

export async function slateContests(slateId: string): Promise<ReviewContest[]> {
  const rows = await sql()`
    select contest_key::text as contest_key, contest_name, entries, places_paid,
           top1_score::float8 as top1_score, cash_score::float8 as cash_score
    from raw.dk_contests
    where slate_id = ${slateId}
    order by entries desc, contest_key`;
  return rows.map((r) => ({
    key: Number(r.contest_key),
    name: r.contest_name != null ? String(r.contest_name) : null,
    entries: Number(r.entries),
    placesPaid: num(r.places_paid),
    top1Score: num(r.top1_score),
    cashScore: num(r.cash_score),
  }));
}

export async function contestPlayers(contestKey: number): Promise<ContestPlayer[]> {
  const rows = await sql()`
    select player_name, position, own::float8 as own, top1_rate::float8 as top1_rate, fpts::float8 as fpts
    from raw.dk_contest_player_totals
    where contest_key = ${contestKey}`;
  return rows.map((r) => ({
    name: String(r.player_name),
    position: r.position != null ? String(r.position) : null,
    own: Number(r.own),
    top1Rate: num(r.top1_rate),
    fpts: num(r.fpts),
  }));
}

/** Mass lineups for the run with the contest entries they matched by their nine names. */
export async function reviewLineups(
  runId: string,
  site: string,
  slateId: string,
  playerIds: Record<string, string>,
): Promise<ReviewLineup[]> {
  const [rows, entryRows] = await Promise.all([
    sql()`
      select lineup_id, stack, salary_used, proj_fpts::float8 as proj_fpts,
             actual_fpts::float8 as actual_fpts, sim_win_pct::float8 as sim_win_pct, lineup
      from model.dfs_lineups
      where run_id = ${runId}::uuid and site = ${site} and slate_id = ${slateId}
        and construction = 'mass'
      order by actual_fpts desc nulls last, proj_fpts desc nulls last, lineup_id`,
    sql()`
      select lineup_id, contest_key::text as contest_key, rank, points::float8 as points,
             cashed, winnings_cash::float8 as winnings_cash
      from model.dfs_lineup_entries
      where run_id = ${runId}::uuid and site = ${site} and slate_id = ${slateId}`,
  ]);
  const entries = new Map<string, ReviewEntry[]>();
  for (const e of entryRows) {
    const id = String(e.lineup_id);
    const list = entries.get(id) ?? [];
    list.push({
      contestKey: Number(e.contest_key),
      rank: Number(e.rank),
      points: num(e.points),
      cashed: e.cashed == null ? null : Boolean(e.cashed),
      winnings: num(e.winnings_cash),
    });
    entries.set(id, list);
  }
  return rows.map((r) => {
    const players = ((r.lineup as { players?: unknown } | null)?.players ?? []) as {
      slot?: string;
      name?: string;
      dk_id?: string | null;
    }[];
    const slots: ReviewSlot[] = players.map((p) => ({
      slot: String(p.slot ?? ""),
      name: String(p.name ?? ""),
      dkId: p.dk_id != null ? String(p.dk_id) : null,
      playerId: p.dk_id != null ? (playerIds[String(p.dk_id)] ?? null) : null,
    }));
    return {
      id: String(r.lineup_id),
      stack: r.stack != null ? String(r.stack) : null,
      salary: num(r.salary_used),
      proj: num(r.proj_fpts),
      actual: num(r.actual_fpts),
      winPct: num(r.sim_win_pct),
      slots,
      entries: entries.get(String(r.lineup_id)) ?? [],
    };
  });
}

/** Every salary-listed player on the slate with the run's sim rates and model.slate_actuals. */
export async function reviewFacts(
  runId: string,
  site: string,
  slateId: string,
  season: number,
  week: number,
): Promise<ReviewFact[]> {
  const rows = await sql()`
    select s.player_id, s.name, s.team, s.position, s.salary,
           pp.fpts_dk_mean::float8 as proj, pp.fpts_dk_sd::float8 as sd,
           pp.dk_p10::float8 as p10, pp.dk_p90::float8 as p90,
           pp.boom_rate::float8 as boom, pp.bust_rate::float8 as bust,
           e.top1_pct::float8 as top1_pct,            e.own_ours::float8 as own_ours,
           e.own_field_sim::float8 as own_field_sim,
           a.dk_pts::float8 as actual
    from (
      select distinct on (player_id) player_id, name, team, position, salary
      from raw.dk_salaries
      where site = ${site} and slate_id = ${slateId} and player_id is not null
      order by player_id, (roster_position = 'FLEX')
    ) s
    left join model.proj_players pp on pp.run_id = ${runId}::uuid and pp.player_id = s.player_id
    left join model.dfs_exposure e
      on e.run_id = ${runId}::uuid and e.site = ${site} and e.slate_id = ${slateId}
     and e.player_id = s.player_id
    left join model.slate_actuals a
      on a.season = ${season} and a.week = ${week} and a.player_id = s.player_id`;
  return rows.map((r) => ({
    playerId: String(r.player_id),
    name: String(r.name),
    team: r.team != null ? String(r.team) : null,
    position: r.position != null ? String(r.position) : null,
    salary: num(r.salary),
    proj: num(r.proj),
    sd: num(r.sd),
    p10: num(r.p10),
    p90: num(r.p90),
    boom: num(r.boom),
    bust: num(r.bust),
    top1Pct: num(r.top1_pct),
    ownOurs: num(r.own_ours),
    ownFieldSim: num(r.own_field_sim),
    actual: num(r.actual),
  }));
}

/** DK salary id to gsis / DST id for the slate. */
async function dkIds(site: string, slateId: string): Promise<Record<string, string>> {
  const rows = await sql()`
    select player_dk_id, player_id
    from raw.dk_salaries
    where site = ${site} and slate_id = ${slateId}
      and player_dk_id is not null and player_id is not null`;
  const out: Record<string, string> = {};
  for (const r of rows) out[String(r.player_dk_id)] = String(r.player_id);
  return out;
}

/**
 * Everything the review page needs, or null when scores are unpublished for the slate.
 * `contestKey` picks one standings file; the largest contest on the slate is the default.
 */
export async function slateReview(args: {
  season: number;
  week: number;
  site: string;
  slate: string;
  slateId: string;
  contestKey?: number | null;
}): Promise<ReviewData | null> {
  const run = await gradedRun(args.site, args.slateId);
  if (!run) return null;
  const [contests, ids, facts] = await Promise.all([
    slateContests(args.slateId),
    dkIds(args.site, args.slateId),
    reviewFacts(run.runId, args.site, args.slateId, args.season, args.week),
  ]);
  const contest = contests.find((c) => c.key === args.contestKey) ?? contests[0] ?? null;
  const [lineups, players] = await Promise.all([
    reviewLineups(run.runId, args.site, args.slateId, ids),
    contest ? contestPlayers(contest.key) : Promise.resolve([] as ContestPlayer[]),
  ]);
  return {
    week: args.week,
    site: args.site,
    slate: args.slate,
    runId: run.runId,
    totalLineups: run.total,
    lineups,
    facts,
    contests,
    contest,
    contestPlayers: players,
  };
}
