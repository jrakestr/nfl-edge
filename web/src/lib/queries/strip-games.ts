import { sql } from "@/lib/db";
import { toStripGame, type StripGame } from "@/lib/kickoff";

/** Week slate chips. Schedules only — no edges. */
export async function stripGames(season: number, week: number): Promise<StripGame[]> {
  const rows = await sql()`
    select game_id, home_team as home, away_team as away,
           to_char(gameday, 'YYYY-MM-DD') as gameday, gametime, location,
           home_score, away_score,
           (home_score is not null and away_score is not null and result is not null) as is_final
    from raw.schedules
    where season = ${season} and week = ${week}
    order by gameday, gametime, game_id`;
  return rows.map((r) =>
    toStripGame({
      game_id: String(r.game_id),
      home: String(r.home),
      away: String(r.away),
      gameday: String(r.gameday),
      gametime: (r.gametime as string | null) ?? null,
      location: (r.location as string | null) ?? null,
      away_score: r.away_score != null ? Number(r.away_score) : null,
      home_score: r.home_score != null ? Number(r.home_score) : null,
      is_final: Boolean(r.is_final),
    }),
  );
}
