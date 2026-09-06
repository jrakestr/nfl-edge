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

/**
 * Season track record from model.results (Step 7). Zero rows → the tile reads
 * "No graded weeks yet". Uses the newest run per week so a re-sim does not double count.
 */
export async function trackRecord(season: number): Promise<TrackRecord> {
  const rows = await sql()`
    with newest as (
      select distinct on (week) run_id, week from model.sim_runs
      where season = ${season} order by week, created_at desc
    ),
    picks as (
      select r.outcome, r.pnl
      from model.results r join newest n on n.run_id = r.run_id
      where r.is_last_snapshot and r.edge > 0
    )
    select (select count(distinct n.week) from newest n join model.results r on r.run_id = n.run_id)::int as graded_weeks,
           count(*) filter (where outcome = 1)::int as wins,
           count(*) filter (where outcome = 0)::int as losses,
           count(*) filter (where outcome is null)::int as pushes,  -- 1 win, 0 loss, null push
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
