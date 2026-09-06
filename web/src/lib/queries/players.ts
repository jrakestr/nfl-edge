import { sql } from "@/lib/db";
import { WeekPlayerSchema, type GameContext, type PlayerHeader, type WeekPlayer } from "@/lib/types";

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

export async function weekPlayers(runId: string): Promise<WeekPlayer[]> {
  const rows = await sql()`
    select pp.player_id,
           coalesce(p.display_name, pp.player_id) as display_name,
           pp.position, pp.team, pp.game_id,
           pp.fpts_dk_mean::float8 as fpts_dk_mean,
           pp.stat_summary -> 'fpts_ppr' -> 'hist' as hist
    from model.proj_players pp
    left join raw.players p on p.gsis_id = pp.player_id
    where pp.run_id = ${runId}::uuid and pp.position is distinct from 'DST'
    order by pp.fpts_dk_mean desc nulls last, coalesce(p.display_name, pp.player_id)`;
  return rows.map((r) => {
    const hist = r.hist && typeof r.hist === "object" ? r.hist : null;
    return WeekPlayerSchema.parse({ ...r, hist });
  });
}
