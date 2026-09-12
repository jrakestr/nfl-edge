import { sql } from "@/lib/db";

export type NgsScore = {
  ngs_away_pts: number;
  ngs_home_pts: number;
  ngs_p_home_win: number | null;
};

/** NFLGameSim rows when raw.external_games exists; empty if the table is missing. */
export async function ngsByGame(gameIds: string[]): Promise<Record<string, NgsScore>> {
  if (gameIds.length === 0) return {};
  try {
    const rows = await sql()`
      select game_id,
             sim_away_pts::float8 as ngs_away_pts,
             sim_home_pts::float8 as ngs_home_pts,
             sim_p_home_win::float8 as ngs_p_home_win
      from raw.external_games
      where source = 'nflgamesim' and game_id = any(${gameIds})`;
    const out: Record<string, NgsScore> = {};
    for (const r of rows) {
      if (r.ngs_away_pts == null || r.ngs_home_pts == null) continue;
      out[String(r.game_id)] = {
        ngs_away_pts: Number(r.ngs_away_pts),
        ngs_home_pts: Number(r.ngs_home_pts),
        ngs_p_home_win: r.ngs_p_home_win != null ? Number(r.ngs_p_home_win) : null,
      };
    }
    return out;
  } catch {
    return {};
  }
}
