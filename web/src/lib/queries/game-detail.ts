import { sql } from "@/lib/db";
import { asGrid } from "@/lib/queries/board";
import { GameDetailSchema, type GameDetail } from "@/lib/types";

/**
 * Drawer detail for one game on a run: persisted line_grid, market_lines history on the
 * same source/bookmaker as market_lines_latest, and top-8 within-game DK correlations.
 */
export async function gameDetail(runId: string, gameId: string): Promise<GameDetail> {
  const [pgRows, histRows, corrRows] = await Promise.all([
    sql()`
      select line_grid
      from model.proj_games
      where run_id = ${runId}::uuid and game_id = ${gameId}
      limit 1`,
    sql()`
      select m.id::int as id,
             m.captured_at,
             m.spread_line::float8 as spread_line,
             m.total_line::float8 as total_line,
             m.home_moneyline,
             m.away_moneyline
      from raw.market_lines m
      join model.market_lines_latest l on l.game_id = m.game_id
      where m.game_id = ${gameId}
        and m.source = l.source
        and m.bookmaker is not distinct from l.bookmaker
      order by m.captured_at asc, m.id asc`,
    sql()`
      select coalesce(pa.display_name, c.player_id_a) as a,
             coalesce(pb.display_name, c.player_id_b) as b,
             pa.position as a_pos,
             pb.position as b_pos,
             c.corr_dk::float8 as corr
      from model.player_correlations c
      join model.proj_players xa
        on xa.run_id = c.run_id and xa.player_id = c.player_id_a and xa.game_id = ${gameId}
      left join raw.players pa on pa.gsis_id = c.player_id_a
      left join raw.players pb on pb.gsis_id = c.player_id_b
      where c.run_id = ${runId}::uuid and c.corr_dk is not null
      order by abs(c.corr_dk) desc
      limit 8`,
  ]);

  return GameDetailSchema.parse({
    grid: asGrid(pgRows[0]?.line_grid),
    lineHistory: histRows,
    correlations: corrRows,
  });
}
