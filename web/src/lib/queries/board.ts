import { sql } from "@/lib/db";
import { maxEdge, pivotEdges, type RawEdge } from "@/lib/edge";
import { BoardRowSchema, type BoardRow } from "@/lib/types";


/**
 * Table rows for a run: proj_games ⨝ raw.schedules ⨝ the game's newest raw.market_lines
 * snapshot ⨝ model.edges_latest (the run's edges at that same snapshot). When `lines` has not
 * yet computed edges for the newest snapshot, `edges` is all-null and the row shows no edge.
 * Sorted by |max edge| desc in TS.
 */
export async function boardRows(runId: string): Promise<BoardRow[]> {
  const rows = await sql()`
    with latest as (
      select distinct on (game_id) id, game_id, captured_at, spread_line, total_line,
             home_spread_odds, away_spread_odds, over_odds, under_odds, home_moneyline, away_moneyline
      from raw.market_lines
      order by game_id, captured_at desc, id desc
    ),
    e as (
      select ref_id,
             json_agg(json_build_object(
               'market_type', market_type, 'side', side,
               'model_prob', model_prob::float8, 'market_prob', market_prob::float8,
               'edge', edge::float8, 'kelly_fraction', kelly_fraction::float8, 'price', price)) as edges
      from model.edges_latest
      where run_id = ${runId}::uuid
      group by ref_id
    )
    select p.game_id, s.home_team as home, s.away_team as away,
           to_char(s.gameday, 'YYYY-MM-DD') as gameday, s.gametime,
           p.fair_spread::float8, p.fair_total::float8, p.mean_spread::float8, p.mean_total::float8,
           p.home_win_prob::float8, p.p_home_cover_market::float8, p.p_over_market::float8,
           l.id::int as market_line_id, l.captured_at,
           l.spread_line::float8, l.total_line::float8,
           l.home_spread_odds, l.away_spread_odds, l.over_odds, l.under_odds,
           l.home_moneyline, l.away_moneyline,
           e.edges
    from model.proj_games p
    join raw.schedules s on s.game_id = p.game_id
    left join latest l on l.game_id = p.game_id
    left join e on e.ref_id = p.game_id
    where p.run_id = ${runId}::uuid
    order by s.gameday, s.gametime, p.game_id`;
  const parsed = rows.map((r) =>
    BoardRowSchema.parse({ ...r, edges: pivotEdges((r.edges as RawEdge[] | null) ?? null) }),
  );
  return parsed.sort((a, b) => maxEdge(b) - maxEdge(a));
}

