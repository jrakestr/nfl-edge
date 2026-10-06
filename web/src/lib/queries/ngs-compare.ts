import { sql } from "@/lib/db";
import type { SiteGame } from "@/lib/ngs-compare";

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** NFLGameSim rows for a season (written by `nfl-edge benchmark nflgamesim`), one per game. */
export async function ngsGames(season: number): Promise<SiteGame[]> {
  const rows = await sql()`
    select game_id, week::int as week, home_team, away_team,
           to_char(gameday, 'YYYY-MM-DD') as gameday, gametime, status,
           sim_margin_home::float8 as sim_margin_home,
           sim_p_home_win::float8 as sim_p_home_win,
           pick_winner_result, margin_within_7, ats_result,
           actual_margin_home::float8 as actual_margin_home
    from raw.external_games
    where source = 'nflgamesim' and season = ${season}
    order by week, gameday, gametime, game_id`;
  return rows.map((r) => ({
    gameId: String(r.game_id),
    week: Number(r.week),
    home: String(r.home_team),
    away: String(r.away_team),
    gameday: String(r.gameday),
    gametime: (r.gametime as string | null) ?? null,
    status: String(r.status ?? "pending"),
    simMarginHome: num(r.sim_margin_home),
    simPHomeWin: num(r.sim_p_home_win),
    pickResult: (r.pick_winner_result as string | null) ?? null,
    marginWithin7: (r.margin_within_7 as string | null) ?? null,
    atsResult: (r.ats_result as string | null) ?? null,
    actualMarginHome: num(r.actual_margin_home),
  }));
}
