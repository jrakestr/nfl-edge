import { sql } from "@/lib/db";
import { kickoffLabel } from "@/lib/format";
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
      select season, week, created_at from model.sim_runs where run_id = ${runId}::uuid
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
           pp.stat_summary -> 'fpts_ppr' -> 'hist' as hist,
           o.status as override_status,
           o.updated_at as override_updated_at,
           run.created_at as run_created_at
    from model.proj_players pp
    cross join run
    left join raw.players p on p.gsis_id = pp.player_id
    left join hist on hist.player_id = pp.player_id
    left join dk on dk.player_id = pp.player_id
    left join raw.player_overrides o
      on o.player_id = pp.player_id and o.season = run.season and o.week = run.week
    where pp.run_id = ${runId}::uuid and pp.position is distinct from 'DST'
    order by pp.fpts_dk_mean desc nulls last, coalesce(p.display_name, pp.player_id)`;
  return rows.map((r) => {
    const hist = r.hist && typeof r.hist === "object" ? r.hist : null;
    return WeekPlayerSchema.parse({ ...r, hist });
  });
}

/** One row per DK id on this slate. Unprojected salary rows still appear. */
export async function slatePlayers(runId: string, site: string, slateId: string): Promise<WeekPlayer[]> {
  const rows = await sql()`
    with run as (
      select season, week, created_at from model.sim_runs where run_id = ${runId}::uuid
    ),
    sal as (
      select distinct on (s.player_dk_id)
        s.player_dk_id, s.player_id, s.name, s.position, s.team, s.salary, s.avg_points, s.game_info
      from raw.dk_salaries s
      where s.site = ${site} and s.slate_id = ${slateId}
      order by s.player_dk_id, case when s.roster_position = 'FLEX' then 1 else 0 end
    ),
    mapped as (
      select player_dk_id, player_id, name, position, salary, avg_points, game_info,
             case upper(coalesce(team, ''))
               when 'LAR' then 'LA'
               when 'JAC' then 'JAX'
               when 'WSH' then 'WAS'
               else team
             end as nfl_team
      from sal
    )
    select coalesce(mapped.player_id, mapped.player_dk_id) as player_id,
           mapped.player_dk_id,
           coalesce(p.display_name, mapped.name) as display_name,
           coalesce(pp.position, mapped.position) as position,
           coalesce(pp.team, mapped.nfl_team) as team,
           coalesce(pp.game_id, sch.game_id) as game_id,
           case
             when coalesce(pp.team, mapped.nfl_team) = sch.home_team then sch.away_team
             when coalesce(pp.team, mapped.nfl_team) = sch.away_team then sch.home_team
             else null
           end as opponent,
           to_char(sch.gameday, 'YYYY-MM-DD') as gameday,
           sch.gametime,
           mapped.salary,
           pp.fpts_dk_mean::float8 as fpts_dk_mean,
           (pp.stat_summary -> 'fpts_ppr' ->> 'p10')::float8 as floor,
           (pp.stat_summary -> 'fpts_ppr' ->> 'p90')::float8 as ceiling,
           e.proj_own::float8 as proj_own,
           mapped.avg_points::float8 as typical_dk,
           ov.status as override_status,
           ov.updated_at as override_updated_at,
           run.created_at as run_created_at
    from mapped
    cross join run
    left join model.proj_players pp
      on pp.run_id = ${runId}::uuid and pp.player_id = mapped.player_id
    left join raw.players p on p.gsis_id = mapped.player_id
    left join model.dfs_exposure e
      on e.run_id = ${runId}::uuid and e.site = ${site}
      and e.slate_id = ${slateId} and e.player_id = mapped.player_id
    left join raw.player_overrides ov
      on ov.season = run.season and ov.week = run.week and ov.player_id = mapped.player_id
    left join raw.schedules sch
      on sch.season = run.season and sch.week = run.week
      and (
        sch.home_team = coalesce(pp.team, mapped.nfl_team)
        or sch.away_team = coalesce(pp.team, mapped.nfl_team)
      )
    order by pp.fpts_dk_mean desc nulls last, coalesce(p.display_name, mapped.name)`;
  return rows.map((r) => {
    const salary = r.salary != null ? Number(r.salary) : null;
    const fpts = r.fpts_dk_mean != null ? Number(r.fpts_dk_mean) : null;
    const gameday = r.gameday != null ? String(r.gameday) : null;
    const gametime = r.gametime != null ? String(r.gametime) : null;
    return WeekPlayerSchema.parse({
      ...r,
      hist: null,
      salary,
      value: salary != null && salary > 0 && fpts != null ? fpts / (salary / 1000) : null,
      kickoff: gameday ? kickoffLabel(gameday, gametime) : null,
    });
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

/** DK ids whose override is out/doubtful and was set after the displayed run. */
export async function staleDkIds(season: number, week: number, runCreatedAt: Date): Promise<Set<string>> {
  const rows = await sql()`
    select distinct s.player_dk_id
    from raw.dk_salaries s
    join raw.player_overrides o on o.player_id = s.player_id
    where o.season = ${season} and o.week = ${week}
      and lower(o.status) in ('out', 'doubtful')
      and o.updated_at > ${runCreatedAt}
      and s.player_dk_id is not null`;
  return new Set(rows.map((r) => String(r.player_dk_id)));
}
