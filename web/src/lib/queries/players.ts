import { sql } from "@/lib/db";

export type PlayerHeader = {
  gsis_id: string;
  display_name: string;
  position: string | null;
  latest_team: string | null;
};

export type GameContext = {
  game_id: string;
  season: number;
  week: number;
  home: string;
  away: string;
  gameday: string;
  gametime: string | null;
};

/** Player header from the crosswalk; null when the id does not resolve. */
export async function playerById(gsisId: string): Promise<PlayerHeader | null> {
  const rows = await sql()`
    select gsis_id, display_name, position, latest_team
    from raw.players where gsis_id = ${gsisId} limit 1`;
  return (rows[0] as PlayerHeader | undefined) ?? null;
}

export async function gameById(gameId: string): Promise<GameContext | null> {
  const rows = await sql()`
    select game_id, season, week, home_team as home, away_team as away,
           to_char(gameday, 'YYYY-MM-DD') as gameday, gametime
    from raw.schedules where game_id = ${gameId} limit 1`;
  return (rows[0] as GameContext | undefined) ?? null;
}
