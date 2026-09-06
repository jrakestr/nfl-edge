import { sql } from "@/lib/db";
import { maxEdge } from "@/lib/edge";
import { BoardRowSchema, type BoardRow, type EdgeSide } from "@/lib/types";

type RawEdge = {
  market_type: "spread" | "total" | "moneyline";
  side: "home" | "away" | "over" | "under";
  model_prob: number;
  market_prob: number;
  edge: number;
  kelly_fraction: number;
  price: number | null;
};

const EMPTY: BoardRow["edges"] = {
  spread_home: null,
  spread_away: null,
  total_over: null,
  total_under: null,
  ml_home: null,
  ml_away: null,
};

export function pivotEdges(rows: RawEdge[] | null): BoardRow["edges"] {
  const out = { ...EMPTY };
  for (const r of rows ?? []) {
    const side: EdgeSide = {
      model_prob: r.model_prob,
      market_prob: r.market_prob,
      edge: r.edge,
      kelly_fraction: r.kelly_fraction,
      price: r.price,
    };
    const key =
      r.market_type === "spread"
        ? (`spread_${r.side}` as "spread_home" | "spread_away")
        : r.market_type === "total"
          ? (`total_${r.side}` as "total_over" | "total_under")
          : (`ml_${r.side}` as "ml_home" | "ml_away");
    out[key] = side;
  }
  return out;
}

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

