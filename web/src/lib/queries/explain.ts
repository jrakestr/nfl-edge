import { sql } from "@/lib/db";

export type ExplainSide = {
  team: string;
  starter_id: string | null;
  starter_name: string | null;
  lookback_id: string | null;
  lookback_name: string | null;
  starter_att: number | null;
  lookback_att: number | null;
  qb_pass_factor: number | null;
  off_ppd_raw: number | null;
  off_ppd_adj: number | null;
  def_ppd_allowed: number | null;
  league_off_ppd: number | null;
  league_def_ppd_allowed: number | null;
  drives_mean: number | null;
  mean_pts: number | null;
  market_implied_pts: number | null;
  market_implied_pts_run: number | null;
  /** mean_pts − market_implied_pts. Present so the model explains a number, not infers one. */
  pts_gap: number | null;
};

export type ExplainPayload = {
  game_id: string;
  home: ExplainSide;
  away: ExplainSide;
  captured_at: string | null;
  run_created_at: string | null;
};

function n(v: unknown): number | null {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function side(
  team: string,
  prefix: "home" | "away",
  r: Record<string, unknown>,
  meanPts: number | null,
  mktPts: number | null,
  runPts: number | null,
): ExplainSide {
  return {
    team,
    starter_id: (r[`${prefix}_starter_id`] as string | null) ?? null,
    starter_name: (r[`${prefix}_starter_name`] as string | null) ?? null,
    lookback_id: (r[`${prefix}_lookback_id`] as string | null) ?? null,
    lookback_name: (r[`${prefix}_lookback_name`] as string | null) ?? null,
    starter_att: n(r[`${prefix}_starter_att`]),
    lookback_att: n(r[`${prefix}_lookback_att`]),
    qb_pass_factor: n(r[`${prefix}_factor`]),
    off_ppd_raw: n(r[`${prefix}_off_ppd_raw`]),
    off_ppd_adj: n(r[`${prefix}_off_ppd_adj`]),
    def_ppd_allowed: n(r[`${prefix}_def_ppd`]),
    league_off_ppd: n(r[`${prefix}_league_off`]),
    league_def_ppd_allowed: n(r[`${prefix}_league_def`]),
    drives_mean: n(r[`${prefix}_drives`]),
    mean_pts: meanPts,
    market_implied_pts: mktPts,
    market_implied_pts_run: runPts,
    pts_gap: meanPts != null && mktPts != null ? meanPts - mktPts : null,
  };
}

/** Join two run_team_inputs rows + proj_games + latest market. Null if inputs are missing. */
export async function explainPayload(runId: string, gameId: string): Promise<ExplainPayload | null> {
  const rows = await sql()`
    select p.game_id, s.home_team, s.away_team,
           p.mean_total::float8 as mean_total, p.mean_spread::float8 as mean_spread,
           p.fair_total::float8 as fair_total, p.fair_spread::float8 as fair_spread,
           p.market_total::float8 as run_total, p.market_spread::float8 as run_spread,
           l.total_line::float8 as total_line, l.spread_line::float8 as spread_line,
           l.captured_at, sr.created_at as run_created_at,
           h.off_ppd_raw::float8 as home_off_ppd_raw, h.off_ppd_adj::float8 as home_off_ppd_adj,
           h.def_ppd_allowed::float8 as home_def_ppd, h.drives_mean::float8 as home_drives,
           h.league_off_ppd::float8 as home_league_off,
           h.league_def_ppd_allowed::float8 as home_league_def,
           h.qb_pass_factor::float8 as home_factor, h.qb_starter_att::float8 as home_starter_att,
           h.qb_lookback_att::float8 as home_lookback_att,
           h.qb_starter_id as home_starter_id, h.qb_lookback_id as home_lookback_id,
           hs.display_name as home_starter_name, hl.display_name as home_lookback_name,
           a.off_ppd_raw::float8 as away_off_ppd_raw, a.off_ppd_adj::float8 as away_off_ppd_adj,
           a.def_ppd_allowed::float8 as away_def_ppd, a.drives_mean::float8 as away_drives,
           a.league_off_ppd::float8 as away_league_off,
           a.league_def_ppd_allowed::float8 as away_league_def,
           a.qb_pass_factor::float8 as away_factor, a.qb_starter_att::float8 as away_starter_att,
           a.qb_lookback_att::float8 as away_lookback_att,
           a.qb_starter_id as away_starter_id, a.qb_lookback_id as away_lookback_id,
           aws.display_name as away_starter_name, awl.display_name as away_lookback_name
    from model.proj_games p
    join model.sim_runs sr on sr.run_id = p.run_id
    join raw.schedules s on s.game_id = p.game_id
    join model.run_team_inputs h on h.run_id = p.run_id and h.team = s.home_team
    join model.run_team_inputs a on a.run_id = p.run_id and a.team = s.away_team
    left join raw.players hs on hs.gsis_id = h.qb_starter_id
    left join raw.players hl on hl.gsis_id = h.qb_lookback_id
    left join raw.players aws on aws.gsis_id = a.qb_starter_id
    left join raw.players awl on awl.gsis_id = a.qb_lookback_id
    left join model.market_lines_latest l on l.game_id = p.game_id
    where p.run_id = ${runId}::uuid and p.game_id = ${gameId}
    limit 1`;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  const meanTotal = n(r.mean_total) ?? n(r.fair_total);
  const meanSpread = n(r.mean_spread) ?? n(r.fair_spread);
  const homeMean = meanTotal != null && meanSpread != null ? (meanTotal + meanSpread) / 2 : null;
  const awayMean = meanTotal != null && meanSpread != null ? (meanTotal - meanSpread) / 2 : null;
  const tot = n(r.total_line);
  const spr = n(r.spread_line);
  const homeMkt = tot != null && spr != null ? (tot + spr) / 2 : null;
  const awayMkt = tot != null && spr != null ? (tot - spr) / 2 : null;
  const runTot = n(r.run_total);
  const runSpr = n(r.run_spread);
  const homeRun = runTot != null && runSpr != null ? (runTot + runSpr) / 2 : null;
  const awayRun = runTot != null && runSpr != null ? (runTot - runSpr) / 2 : null;
  const captured = r.captured_at == null ? null : String(r.captured_at);
  const runAt = r.run_created_at == null ? null : String(r.run_created_at);
  return {
    game_id: String(r.game_id),
    home: side(String(r.home_team), "home", r, homeMean, homeMkt, homeRun),
    away: side(String(r.away_team), "away", r, awayMean, awayMkt, awayRun),
    captured_at: captured,
    run_created_at: runAt,
  };
}
