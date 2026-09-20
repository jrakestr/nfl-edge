import { sql } from "@/lib/db";
import { calibrationBucketsFrom, type CalInput } from "@/lib/grade-select";
import type { CalBucket, GradedGame, Wlp } from "@/lib/grade-types";

export type { CalBucket, GradedGame, Wlp };

export type TrackRecord = {
  gradedWeeks: number;
  /** Picks on the last pre-kickoff snapshot with positive edge (grade.py's pick definition). */
  wins: number;
  losses: number;
  pushes: number;
  /** Flat 1u ROI over those picks; null until graded. */
  roi: number | null;
  /** Quarter-Kelly ROI; secondary figure only. */
  kellyRoi: number | null;
  sides: Wlp;
  totals: Wlp;
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
      select r.outcome, r.pnl, r.pnl_kelly, r.market_type, s.week
      from model.results r
      join model.sim_runs s on s.run_id = r.run_id
      where s.season = ${season}
        and r.predated_kickoff and r.is_last_snapshot and r.edge > 0
    )
    select count(distinct week)::int as graded_weeks,
           count(*) filter (where outcome = 1)::int as wins,
           count(*) filter (where outcome = 0)::int as losses,
           count(*) filter (where outcome is null)::int as pushes,
           case when count(*) > 0 then (sum(pnl) / count(*))::float8 end as roi,
           case when count(*) > 0 then (sum(pnl_kelly) / count(*))::float8 end as kelly_roi,
           count(*) filter (where market_type = 'spread' and outcome = 1)::int as sides_w,
           count(*) filter (where market_type = 'spread' and outcome = 0)::int as sides_l,
           count(*) filter (where market_type = 'spread' and outcome is null)::int as sides_p,
           count(*) filter (where market_type = 'total' and outcome = 1)::int as totals_w,
           count(*) filter (where market_type = 'total' and outcome = 0)::int as totals_l,
           count(*) filter (where market_type = 'total' and outcome is null)::int as totals_p
    from picks`;
  const r = rows[0];
  return {
    gradedWeeks: r?.graded_weeks ?? 0,
    wins: r?.wins ?? 0,
    losses: r?.losses ?? 0,
    pushes: r?.pushes ?? 0,
    roi: r?.roi ?? null,
    kellyRoi: r?.kelly_roi ?? null,
    sides: { wins: r?.sides_w ?? 0, losses: r?.sides_l ?? 0, pushes: r?.sides_p ?? 0 },
    totals: { wins: r?.totals_w ?? 0, losses: r?.totals_l ?? 0, pushes: r?.totals_p ?? 0 },
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

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/**
 * One row per graded game. Last snapshot of the newest predated run.
 * Filter is predated_kickoff AND is_last_snapshot — not the pick set.
 */
export async function gradedGames(season: number): Promise<GradedGame[]> {
  const rows = await sql()`
    with last as (
      select r.ref_id, r.run_id, r.market_type, r.side,
             r.line::float8 as line, r.model_prob::float8 as model_prob,
             r.market_prob::float8 as market_prob, r.edge::float8 as edge,
             r.outcome, r.verdict_call, r.clv_points::float8 as clv_points,
             r.market_line_id, s.week, s.created_at
      from model.results r
      join model.sim_runs s on s.run_id = r.run_id
      where s.season = ${season}
        and r.predated_kickoff and r.is_last_snapshot
    ),
    chosen as (
      select distinct on (ref_id) ref_id, run_id, week
      from last
      order by ref_id, created_at desc
    )
    select c.ref_id as game_id, c.week, c.run_id::text as run_id,
           sc.home_team as home, sc.away_team as away,
           to_char(sc.gameday, 'YYYY-MM-DD') as gameday, sc.gametime,
           sc.home_score, sc.away_score, sc.result::float8 as result,
           case when sc.away_score is not null and sc.home_score is not null
                then (sc.away_score + sc.home_score) end as score_total,
           g.mean_spread::float8 as mean_spread,
           g.mean_total::float8 as mean_total,
           g.home_win_prob::float8 as home_win_prob,
           sh.line as spread_line, sh.model_prob as spread_model_prob,
           sh.market_prob as spread_market_prob, sh.edge as spread_edge,
           sh.outcome as spread_outcome, sh.clv_points as spread_clv_points,
           sh.verdict_call as spread_verdict_call,
           tov.line as total_line, tov.model_prob as total_model_prob,
           tov.market_prob as total_market_prob, tov.edge as total_edge,
           tov.outcome as total_outcome, tov.clv_points as total_clv_points,
           mh.model_prob as ml_model_prob, mh.market_prob as ml_market_prob,
           mh.edge as ml_edge, mh.outcome as ml_outcome,
           ml.home_spread_odds, ml.away_spread_odds
    from chosen c
    join raw.schedules sc on sc.game_id = c.ref_id
    left join model.proj_games g on g.run_id = c.run_id and g.game_id = c.ref_id
    left join last sh on sh.ref_id = c.ref_id and sh.run_id = c.run_id
      and sh.market_type = 'spread' and sh.side = 'home'
    left join last tov on tov.ref_id = c.ref_id and tov.run_id = c.run_id
      and tov.market_type = 'total' and tov.side = 'over'
    left join last mh on mh.ref_id = c.ref_id and mh.run_id = c.run_id
      and mh.market_type = 'moneyline' and mh.side = 'home'
    left join raw.market_lines ml on ml.id = sh.market_line_id
    order by c.week, sc.gameday, sc.gametime, c.ref_id`;
  return rows.map((r) => ({
    gameId: String(r.game_id),
    week: Number(r.week),
    runId: String(r.run_id),
    home: String(r.home),
    away: String(r.away),
    gameday: String(r.gameday),
    gametime: (r.gametime as string | null) ?? null,
    homeScore: r.home_score == null ? null : Number(r.home_score),
    awayScore: r.away_score == null ? null : Number(r.away_score),
    result: num(r.result),
    scoreTotal: r.score_total == null ? null : Number(r.score_total),
    meanSpread: num(r.mean_spread),
    meanTotal: num(r.mean_total),
    homeWinProb: num(r.home_win_prob),
    spreadLine: num(r.spread_line),
    spreadModelProb: num(r.spread_model_prob),
    spreadMarketProb: num(r.spread_market_prob),
    spreadEdge: num(r.spread_edge),
    spreadOutcome: r.spread_outcome == null ? null : Number(r.spread_outcome),
    spreadClvPoints: num(r.spread_clv_points),
    spreadVerdictCall: (r.spread_verdict_call as string | null) ?? null,
    totalLine: num(r.total_line),
    totalModelProb: num(r.total_model_prob),
    totalMarketProb: num(r.total_market_prob),
    totalEdge: num(r.total_edge),
    totalOutcome: r.total_outcome == null ? null : Number(r.total_outcome),
    totalClvPoints: num(r.total_clv_points),
    mlModelProb: num(r.ml_model_prob),
    mlMarketProb: num(r.ml_market_prob),
    mlEdge: num(r.ml_edge),
    mlOutcome: r.ml_outcome == null ? null : Number(r.ml_outcome),
    homeSpreadOdds: r.home_spread_odds == null ? null : Number(r.home_spread_odds),
    awaySpreadOdds: r.away_spread_odds == null ? null : Number(r.away_spread_odds),
  }));
}

/**
 * model_prob deciles vs hit rate on every last-snapshot predated line
 * for one canonical side (home / over). Not the edge > 0 pick set.
 */
export async function calibrationBuckets(
  season: number,
  marketType?: string | null,
): Promise<CalBucket[]> {
  const rows = await sql()`
    select r.model_prob::float8 as model_prob, r.outcome, r.market_type, r.side
    from model.results r
    join model.sim_runs s on s.run_id = r.run_id
    where s.season = ${season}
      and r.predated_kickoff and r.is_last_snapshot`;
  const input: CalInput[] = rows.map((r) => ({
    modelProb: Number(r.model_prob),
    outcome: r.outcome == null ? null : Number(r.outcome),
    marketType: String(r.market_type),
    side: String(r.side),
  }));
  return calibrationBucketsFrom(input, marketType);
}
