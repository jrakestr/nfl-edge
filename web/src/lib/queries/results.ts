import { sql } from "@/lib/db";

export type TrackRecord = {
  gradedWeeks: number;
  /** Picks on the last pre-kickoff snapshot with positive edge (grade.py's pick definition). */
  wins: number;
  losses: number;
  pushes: number;
  /** Flat 1u ROI over those picks; null until graded. */
  roi: number | null;
};

export type WeekScoreboard = {
  nGames: number;
  spread: { wins: number; losses: number; pushes: number };
  total: { wins: number; losses: number; pushes: number };
  marginMae: number | null;
  totalMae: number | null;
};

/**
 * Season track record from model.results. Only rows grade.py marked
 * predated_kickoff — the board does not re-derive which run was live.
 */
export async function trackRecord(season: number): Promise<TrackRecord> {
  const rows = await sql()`
    with picks as (
      select r.outcome, r.pnl, s.week
      from model.results r
      join model.sim_runs s on s.run_id = r.run_id
      where s.season = ${season}
        and r.predated_kickoff and r.is_last_snapshot and r.edge > 0
    )
    select count(distinct week)::int as graded_weeks,
           count(*) filter (where outcome = 1)::int as wins,
           count(*) filter (where outcome = 0)::int as losses,
           count(*) filter (where outcome is null)::int as pushes,
           case when count(*) > 0 then (sum(pnl) / count(*))::float8 end as roi
    from picks`;
  const r = rows[0];
  return {
    gradedWeeks: r?.graded_weeks ?? 0,
    wins: r?.wins ?? 0,
    losses: r?.losses ?? 0,
    pushes: r?.pushes ?? 0,
    roi: r?.roi ?? null,
  };
}

/**
 * Week ATS / totals record and MAE from predated_kickoff results plus that
 * run's proj_games means. No second outcome function.
 */
export async function weekScoreboard(season: number, week: number): Promise<WeekScoreboard> {
  const rows = await sql()`
    with picks as (
      select r.ref_id, r.run_id, r.market_type, r.outcome
      from model.results r
      join model.sim_runs s on s.run_id = r.run_id
      where s.season = ${season} and s.week = ${week}
        and r.predated_kickoff and r.is_last_snapshot and r.edge > 0
    ),
    deltas as (
      select distinct on (p.ref_id)
        abs(sc.result::float8 - g.mean_spread::float8) as margin_err,
        abs(sc.total::float8 - g.mean_total::float8) as total_err
      from picks p
      join raw.schedules sc on sc.game_id = p.ref_id
      join model.proj_games g on g.run_id = p.run_id and g.game_id = p.ref_id
      where sc.result is not null and sc.total is not null
    )
    select count(*) filter (where market_type = 'spread' and outcome = 1)::int as spread_w,
           count(*) filter (where market_type = 'spread' and outcome = 0)::int as spread_l,
           count(*) filter (where market_type = 'spread' and outcome is null)::int as spread_p,
           count(*) filter (where market_type = 'total' and outcome = 1)::int as total_w,
           count(*) filter (where market_type = 'total' and outcome = 0)::int as total_l,
           count(*) filter (where market_type = 'total' and outcome is null)::int as total_p,
           (select avg(margin_err) from deltas)::float8 as margin_mae,
           (select avg(total_err) from deltas)::float8 as total_mae,
           (select count(*) from deltas)::int as n_games
    from picks`;
  const r = rows[0];
  return {
    nGames: r?.n_games ?? 0,
    spread: { wins: r?.spread_w ?? 0, losses: r?.spread_l ?? 0, pushes: r?.spread_p ?? 0 },
    total: { wins: r?.total_w ?? 0, losses: r?.total_l ?? 0, pushes: r?.total_p ?? 0 },
    marginMae: r?.margin_mae ?? null,
    totalMae: r?.total_mae ?? null,
  };
}
