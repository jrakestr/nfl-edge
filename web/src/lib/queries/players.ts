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
  // Typical game = prior-season per-game DK (scoring.yaml + bonuses). Fallback: DK AvgPointsPerGame.
  const rows = await sql()`
    with run as (
      select season, week from model.sim_runs where run_id = ${runId}::uuid
    ),
    hist as (
      select w.player_id, avg(
        coalesce((w.stats->>'passing_yards')::float, 0) * 0.04
        + coalesce((w.stats->>'passing_tds')::float, 0) * 4
        + coalesce(
            (w.stats->>'interceptions')::float,
            (w.stats->>'passing_interceptions')::float,
            0
          ) * -1
        + coalesce((w.stats->>'rushing_yards')::float, 0) * 0.1
        + coalesce((w.stats->>'rushing_tds')::float, 0) * 6
        + coalesce((w.stats->>'receptions')::float, 0) * 1
        + coalesce((w.stats->>'receiving_yards')::float, 0) * 0.1
        + coalesce((w.stats->>'receiving_tds')::float, 0) * 6
        + (
            coalesce((w.stats->>'rushing_fumbles_lost')::float, 0)
            + coalesce((w.stats->>'receiving_fumbles_lost')::float, 0)
            + coalesce((w.stats->>'sack_fumbles_lost')::float, 0)
          ) * -1
        + (
            coalesce((w.stats->>'passing_2pt_conversions')::float, 0)
            + coalesce((w.stats->>'rushing_2pt_conversions')::float, 0)
            + coalesce((w.stats->>'receiving_2pt_conversions')::float, 0)
          ) * 2
        + case when coalesce((w.stats->>'passing_yards')::float, 0) >= 300 then 3 else 0 end
        + case when coalesce((w.stats->>'rushing_yards')::float, 0) >= 100 then 3 else 0 end
        + case when coalesce((w.stats->>'receiving_yards')::float, 0) >= 100 then 3 else 0 end
      ) as typical_dk
      from raw.player_stats_weekly w
      cross join run
      where w.season = run.season - 1
      group by w.player_id
    ),
    dk as (
      select distinct on (s.player_id) s.player_id, s.avg_points
      from raw.dk_salaries s
      cross join run
      where s.site = 'dk'
        and s.player_id is not null
        and split_part(s.slate_id, '_', 1)::int = run.season
        and split_part(s.slate_id, '_', 2)::int = run.week
      order by s.player_id,
               case when split_part(s.slate_id, '_', 3) = 'main' then 0 else 1 end
    )
    select pp.player_id,
           coalesce(p.display_name, pp.player_id) as display_name,
           pp.position, pp.team, pp.game_id,
           pp.fpts_dk_mean::float8 as fpts_dk_mean,
           coalesce(hist.typical_dk, dk.avg_points)::float8 as typical_dk,
           pp.stat_summary -> 'fpts_ppr' -> 'hist' as hist
    from model.proj_players pp
    left join raw.players p on p.gsis_id = pp.player_id
    left join hist on hist.player_id = pp.player_id
    left join dk on dk.player_id = pp.player_id
    where pp.run_id = ${runId}::uuid and pp.position is distinct from 'DST'
    order by pp.fpts_dk_mean desc nulls last, coalesce(p.display_name, pp.player_id)`;
  return rows.map((r) => {
    const hist = r.hist && typeof r.hist === "object" ? r.hist : null;
    return WeekPlayerSchema.parse({ ...r, hist });
  });
}

export type DrawerPlayer = {
  display_name: string;
  position: string | null;
  fpts_dk_mean: number | null;
};

/** Top 10 DK projections per game for the edge-board drawer. */
export async function topPlayersByGame(runId: string): Promise<Record<string, DrawerPlayer[]>> {
  const rows = await sql()`
    select pp.game_id,
           coalesce(p.display_name, pp.player_id) as display_name,
           pp.position,
           pp.fpts_dk_mean::float8 as fpts_dk_mean
    from model.proj_players pp
    left join raw.players p on p.gsis_id = pp.player_id
    where pp.run_id = ${runId}::uuid
    order by pp.game_id, pp.fpts_dk_mean desc nulls last`;
  const out: Record<string, DrawerPlayer[]> = {};
  for (const r of rows) {
    const gid = String(r.game_id);
    const list = out[gid] ?? (out[gid] = []);
    if (list.length >= 10) continue;
    list.push({
      display_name: String(r.display_name),
      position: r.position != null ? String(r.position) : null,
      fpts_dk_mean: r.fpts_dk_mean != null ? Number(r.fpts_dk_mean) : null,
    });
  }
  return out;
}
