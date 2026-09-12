import { sortBoardRows } from "@/lib/board-sort";
import { sql } from "@/lib/db";
import { hasStarted } from "@/lib/kickoff";
import { resolveBoardEdges, type LineGrid, type PersistedEdge } from "@/lib/line-grid";
import { BoardRowSchema, type BoardRow, type GradedMarket } from "@/lib/types";

function asGrid(raw: unknown): LineGrid | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as LineGrid;
  if (!g.margin?.counts || !g.total?.counts) return null;
  return g;
}

type GradedPick = { market_type: string; side: string; outcome: number | null; clv: number | null };

function pivotGraded(picks: GradedPick[] | null): BoardRow["graded"] {
  if (!picks?.length) return null;
  const by: Record<string, GradedMarket> = {};
  for (const p of picks) {
    by[p.market_type] = { side: p.side, outcome: p.outcome, clv: p.clv };
  }
  return {
    spread: by.spread ?? null,
    total: by.total ?? null,
    moneyline: by.moneyline ?? null,
  };
}

export { sortBoardRows };

/**
 * Table rows for a run: proj_games ⨝ schedules ⨝ newest market_lines.
 * Persisted model.edges are used only when their market_line_id equals that snapshot;
 * otherwise the line_grid computes live six-side edges (moneyline = grid at 0).
 * Graded means and outcomes come from model.results (predated_kickoff rows only);
 * the board does not re-derive which run was live at kickoff.
 */
export async function boardRows(runId: string): Promise<BoardRow[]> {
  const rows = await sql()`
    with latest as (
      select distinct on (game_id) id, game_id, captured_at, spread_line, total_line,
             home_spread_odds, away_spread_odds, over_odds, under_odds, home_moneyline, away_moneyline
      from raw.market_lines
      order by game_id, captured_at desc, id desc
    ),
    newest_edge as (
      select distinct on (e.ref_id) e.ref_id, e.market_line_id
      from model.edges e
      join raw.market_lines m on m.id = e.market_line_id
      where e.run_id = ${runId}::uuid
      order by e.ref_id, m.captured_at desc, e.market_line_id desc
    ),
    e as (
      select e.ref_id, e.market_line_id,
             json_agg(json_build_object(
               'market_type', e.market_type, 'side', e.side,
               'model_prob', e.model_prob::float8, 'market_prob', e.market_prob::float8,
               'edge', e.edge::float8, 'kelly_fraction', e.kelly_fraction::float8, 'price', e.price,
               'market_line_id', e.market_line_id)) as edges
      from model.edges e
      join newest_edge n on n.ref_id = e.ref_id and n.market_line_id = e.market_line_id
      where e.run_id = ${runId}::uuid
      group by e.ref_id, e.market_line_id
    ),
    graded as (
      select r.ref_id as game_id, r.run_id,
             json_agg(json_build_object(
               'market_type', r.market_type, 'side', r.side,
               'outcome', r.outcome, 'clv', r.clv::float8)) as picks
      from model.results r
      where r.predated_kickoff and r.is_last_snapshot and r.edge > 0
      group by r.ref_id, r.run_id
    )
    select p.game_id, s.home_team as home, s.away_team as away,
           to_char(s.gameday, 'YYYY-MM-DD') as gameday, s.gametime, s.location,
           s.home_score, s.away_score, s.result::float8 as result,
           (s.home_score is not null and s.away_score is not null and s.result is not null) as is_final,
           coalesce(gp.mean_spread, p.mean_spread)::float8 as mean_spread,
           coalesce(gp.mean_total, p.mean_total)::float8 as mean_total,
           p.fair_spread::float8, p.fair_total::float8,
           p.home_win_prob::float8, p.p_home_cover_market::float8, p.p_over_market::float8,
           l.id::int as market_line_id, l.captured_at,
           l.spread_line::float8, l.total_line::float8,
           l.home_spread_odds, l.away_spread_odds, l.over_odds, l.under_odds,
           l.home_moneyline, l.away_moneyline,
           e.market_line_id::int as persisted_edge_line_id,
           case when e.market_line_id = l.id then e.edges else null end as edges,
           p.line_grid,
           gr.run_id::text as graded_run_id,
           gr.picks as graded_picks
    from model.proj_games p
    join raw.schedules s on s.game_id = p.game_id
    left join latest l on l.game_id = p.game_id
    left join e on e.ref_id = p.game_id
    left join graded gr on gr.game_id = p.game_id
    left join model.proj_games gp on gp.run_id = gr.run_id and gp.game_id = p.game_id
    where p.run_id = ${runId}::uuid
    order by s.gameday, s.gametime, p.game_id`;
  const parsed = rows.map((r) => {
    const snap = {
      spread_line: r.spread_line as number | null,
      total_line: r.total_line as number | null,
      home_spread_odds: r.home_spread_odds as number | null,
      away_spread_odds: r.away_spread_odds as number | null,
      over_odds: r.over_odds as number | null,
      under_odds: r.under_odds as number | null,
      home_moneyline: r.home_moneyline as number | null,
      away_moneyline: r.away_moneyline as number | null,
    };
    const edges = resolveBoardEdges({
      snapshotId: (r.market_line_id as number | null) ?? null,
      persisted: (r.edges as PersistedEdge[] | null) ?? null,
      persistedLineId: (r.persisted_edge_line_id as number | null) ?? null,
      grid: asGrid(r.line_grid),
      snap,
    });
    const gameday = r.gameday as string;
    const gametime = (r.gametime as string | null) ?? null;
    const location = (r.location as string | null) ?? null;
    return BoardRowSchema.parse({
      ...r,
      edges,
      is_final: Boolean(r.is_final),
      has_started: hasStarted(gameday, gametime, location),
      graded_run_id: (r.graded_run_id as string | null) ?? null,
      graded: pivotGraded((r.graded_picks as GradedPick[] | null) ?? null),
    });
  });
  return sortBoardRows(parsed);
}
