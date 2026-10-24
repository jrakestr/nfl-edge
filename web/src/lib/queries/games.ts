import { sql } from "@/lib/db";

export type NgsScore = {
  ngs_away_pts: number;
  ngs_home_pts: number;
  ngs_p_home_win: number | null;
};

export type TrenchTeamRank = {
  team: string;
  games: number;
  sack_rate_allowed: number | null;
  sack_rate_rank: number | null;
  epa_per_dropback: number | null;
  epa_db_rank: number | null;
  epa_per_play: number | null;
  epa_play_rank: number | null;
  neutral_pass_rate: number | null;
  neutral_pass_rank: number | null;
  proe: number | null;
  proe_rank: number | null;
  yds_per_att: number | null;
  plays_per_drive: number | null;
  pace_rank: number | null;
  def_sack_rate: number | null;
  def_sack_rank: number | null;
  def_epa_per_dropback: number | null;
  def_epa_db_rank: number | null;
  of_teams: number;
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

/**
 * Offensive line, pass-protection, PROE, pace, and opposing defensive front rankings
 * computed 100% from free `raw.team_game_agg` rows strictly before `week` (`week < W`).
 */
export async function trenchRanksForWeek(
  season: number,
  week: number,
): Promise<Record<string, TrenchTeamRank>> {
  try {
    const rows = await sql()`
      with off_agg as (
        select t.team,
               count(*)::int as games,
               (sum(t.sacks)::float8 / nullif(sum(t.dropbacks), 0))::float8 as sack_rate_allowed,
               avg(t.epa_per_dropback)::float8 as epa_per_dropback,
               avg(t.epa_per_play)::float8 as epa_per_play,
               avg(t.neutral_pass_rate)::float8 as neutral_pass_rate,
               (avg(t.pass_rate) - avg(t.neutral_pass_rate))::float8 as proe,
               avg(t.yds_per_att)::float8 as yds_per_att,
               avg(t.plays_per_drive)::float8 as plays_per_drive
        from raw.team_game_agg t
        where t.season = ${season} and t.week < ${week}
        group by t.team
      ),
      def_agg as (
        select t.opponent as team,
               (sum(t.sacks)::float8 / nullif(sum(t.dropbacks), 0))::float8 as def_sack_rate,
               avg(t.epa_per_dropback)::float8 as def_epa_per_dropback
        from raw.team_game_agg t
        where t.season = ${season} and t.week < ${week}
        group by t.opponent
      ),
      joined as (
        select o.*,
               d.def_sack_rate,
               d.def_epa_per_dropback,
               count(*) over ()::int as of_teams,
               rank() over (order by o.sack_rate_allowed asc nulls last)::int as sack_rate_rank,
               rank() over (order by o.epa_per_dropback desc nulls last)::int as epa_db_rank,
               rank() over (order by o.epa_per_play desc nulls last)::int as epa_play_rank,
               rank() over (order by o.neutral_pass_rate desc nulls last)::int as neutral_pass_rank,
               rank() over (order by o.proe desc nulls last)::int as proe_rank,
               rank() over (order by o.plays_per_drive desc nulls last)::int as pace_rank,
               rank() over (order by d.def_sack_rate desc nulls last)::int as def_sack_rank,
               rank() over (order by d.def_epa_per_dropback asc nulls last)::int as def_epa_db_rank
        from off_agg o
        left join def_agg d on d.team = o.team
      )
      select * from joined`;

    const out: Record<string, TrenchTeamRank> = {};
    for (const r of rows) {
      const team = String(r.team);
      out[team] = {
        team,
        games: Number(r.games ?? 0),
        sack_rate_allowed: r.sack_rate_allowed != null ? Number(r.sack_rate_allowed) : null,
        sack_rate_rank: r.sack_rate_rank != null ? Number(r.sack_rate_rank) : null,
        epa_per_dropback: r.epa_per_dropback != null ? Number(r.epa_per_dropback) : null,
        epa_db_rank: r.epa_db_rank != null ? Number(r.epa_db_rank) : null,
        epa_per_play: r.epa_per_play != null ? Number(r.epa_per_play) : null,
        epa_play_rank: r.epa_play_rank != null ? Number(r.epa_play_rank) : null,
        neutral_pass_rate: r.neutral_pass_rate != null ? Number(r.neutral_pass_rate) : null,
        neutral_pass_rank: r.neutral_pass_rank != null ? Number(r.neutral_pass_rank) : null,
        proe: r.proe != null ? Number(r.proe) : null,
        proe_rank: r.proe_rank != null ? Number(r.proe_rank) : null,
        yds_per_att: r.yds_per_att != null ? Number(r.yds_per_att) : null,
        plays_per_drive: r.plays_per_drive != null ? Number(r.plays_per_drive) : null,
        pace_rank: r.pace_rank != null ? Number(r.pace_rank) : null,
        def_sack_rate: r.def_sack_rate != null ? Number(r.def_sack_rate) : null,
        def_sack_rank: r.def_sack_rank != null ? Number(r.def_sack_rank) : null,
        def_epa_per_dropback: r.def_epa_per_dropback != null ? Number(r.def_epa_per_dropback) : null,
        def_epa_db_rank: r.def_epa_db_rank != null ? Number(r.def_epa_db_rank) : null,
        of_teams: Number(r.of_teams ?? 32),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export type VegasGameSnap = {
  captured_at: string;
  spread_line: number | null;
  total_line: number | null;
};

export type VegasMovementData = {
  game_id: string;
  open_spread: number | null;
  live_spread: number | null;
  open_total: number | null;
  live_total: number | null;
  snaps: VegasGameSnap[];
  roof: string | null;
  surface: string | null;
  temp: number | null;
  wind: number | null;
};

/**
 * Earliest (open) vs latest (live) market lines and snapshot history per game on this week,
 * plus stadium weather (`roof`, `surface`, `temp`, `wind`) from `raw.schedules`.
 */
export async function vegasMovementByGame(
  gameIds: string[],
): Promise<Record<string, VegasMovementData>> {
  if (gameIds.length === 0) return {};
  try {
    const [snapRows, schRows] = await Promise.all([
      sql()`
        select m.game_id,
               to_char(m.captured_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as captured_at,
               m.spread_line::float8 as spread_line,
               m.total_line::float8 as total_line
        from raw.market_lines m
        join model.market_lines_latest l on l.game_id = m.game_id
        where m.game_id = any(${gameIds})
          and m.source = l.source
          and m.bookmaker is not distinct from l.bookmaker
        order by m.game_id, m.captured_at asc, m.id asc`,
      sql()`
        select game_id, roof, surface, temp::float8 as temp, wind::float8 as wind
        from raw.schedules
        where game_id = any(${gameIds})`,
    ]);

    const out: Record<string, VegasMovementData> = {};
    for (const s of schRows) {
      const gid = String(s.game_id);
      out[gid] = {
        game_id: gid,
        open_spread: null,
        live_spread: null,
        open_total: null,
        live_total: null,
        snaps: [],
        roof: s.roof != null ? String(s.roof) : null,
        surface: s.surface != null ? String(s.surface) : null,
        temp: s.temp != null ? Number(s.temp) : null,
        wind: s.wind != null ? Number(s.wind) : null,
      };
    }

    for (const r of snapRows) {
      const gid = String(r.game_id);
      const entry =
        out[gid] ??
        (out[gid] = {
          game_id: gid,
          open_spread: null,
          live_spread: null,
          open_total: null,
          live_total: null,
          snaps: [],
          roof: null,
          surface: null,
          temp: null,
          wind: null,
        });
      const snap: VegasGameSnap = {
        captured_at: String(r.captured_at ?? ""),
        spread_line: r.spread_line != null ? Number(r.spread_line) : null,
        total_line: r.total_line != null ? Number(r.total_line) : null,
      };
      entry.snaps.push(snap);
    }

    for (const entry of Object.values(out)) {
      const first = entry.snaps[0];
      const last = entry.snaps.at(-1);
      entry.open_spread = first?.spread_line ?? null;
      entry.live_spread = last?.spread_line ?? null;
      entry.open_total = first?.total_line ?? null;
      entry.live_total = last?.total_line ?? null;
    }

    return out;
  } catch {
    return {};
  }
}

export type FieldSkillPlayer = {
  player_id: string;
  display_name: string;
  position: string;
  team: string;
  game_id: string;
  salary: number | null;
  fpts_dk_mean: number | null;
  yr_target_share: number | null;
  mth_target_share: number | null;
  yr_snap_pct: number | null;
  mth_snap_pct: number | null;
  yr_fpts_pg: number | null;
  mth_fpts_pg: number | null;
  yr_opps_pg: number | null;
  mth_opps_pg: number | null;
  yr_yprr: number | null;
  mth_yprr: number | null;
};

/**
 * Skill players per team with Season (`Yr`) and Last-4-Weeks (`Mth`) usage & efficiency metrics
 * from `model.player_usage_weekly` strictly before `week` (`week < W`), joined to `model.proj_players`
 * when a simulation run exists.
 */
export async function skillPlayersForWeek(
  season: number,
  week: number,
  runId: string | null,
  gameIds: string[],
): Promise<Record<string, FieldSkillPlayer[]>> {
  if (gameIds.length === 0) return {};
  try {
    const rows = await sql()`
      with sch as (
        select game_id, home_team, away_team
        from raw.schedules
        where game_id = any(${gameIds})
      ),
      teams as (
        select game_id, home_team as team from sch
        union all
        select game_id, away_team as team from sch
      ),
      u_ranked as (
        select u.player_id,
               u.team,
               u.position,
               u.week,
               u.offense_pct::float8 as snap_pct,
               u.target_share::float8 as target_share,
               u.fpts_ppr::float8 as fpts_ppr,
               (coalesce(u.targets, 0) + coalesce(u.carries, 0))::float8 as opps,
               case
                 when coalesce(u.routes_est, 0) > 0 then (coalesce(u.rec_yds, 0)::float8 / u.routes_est)
                 else null
               end as yprr,
               row_number() over (partition by u.player_id order by u.week desc) as rn
        from model.player_usage_weekly u
        where u.season = ${season} and u.week < ${week}
          and u.position in ('QB', 'RB', 'WR', 'TE')
      ),
      u_agg as (
        select player_id,
               max(team) as u_team,
               max(position) as u_pos,
               avg(target_share)::float8 as yr_target_share,
               avg(target_share) filter (where rn <= 4)::float8 as mth_target_share,
               avg(snap_pct)::float8 as yr_snap_pct,
               avg(snap_pct) filter (where rn <= 4)::float8 as mth_snap_pct,
               avg(fpts_ppr)::float8 as yr_fpts_pg,
               avg(fpts_ppr) filter (where rn <= 4)::float8 as mth_fpts_pg,
               avg(opps)::float8 as yr_opps_pg,
               avg(opps) filter (where rn <= 4)::float8 as mth_opps_pg,
               avg(yprr)::float8 as yr_yprr,
               avg(yprr) filter (where rn <= 4)::float8 as mth_yprr
        from u_ranked
        group by player_id
      ),
      proj as (
        select pp.player_id,
               pp.team,
               pp.position,
               pp.game_id,
               pp.fpts_dk_mean::float8 as fpts_dk_mean
        from model.proj_players pp
        where ${runId != null} and pp.run_id = ${runId ?? "00000000-0000-0000-0000-000000000000"}::uuid
          and pp.game_id = any(${gameIds})
          and pp.position in ('QB', 'RB', 'WR', 'TE')
      ),
      dk as (
        select distinct on (s.player_id) s.player_id, s.salary
        from raw.dk_salaries s
        where s.site = 'dk'
          and s.player_id is not null
          and split_part(s.slate_id, '_', 1)::int = ${season}
          and split_part(s.slate_id, '_', 2)::int = ${week}
        order by s.player_id,
                 case when split_part(s.slate_id, '_', 3) = 'main' then 0 else 1 end
      ),
      combined as (
        select coalesce(pr.player_id, ua.player_id) as player_id,
               coalesce(pr.team, ua.u_team) as team,
               coalesce(pr.position, ua.u_pos) as position,
               t.game_id,
               pr.fpts_dk_mean,
               dk.salary,
               ua.yr_target_share,
               ua.mth_target_share,
               ua.yr_snap_pct,
               ua.mth_snap_pct,
               ua.yr_fpts_pg,
               ua.mth_fpts_pg,
               ua.yr_opps_pg,
               ua.mth_opps_pg,
               ua.yr_yprr,
               ua.mth_yprr
        from u_agg ua
        full outer join proj pr on pr.player_id = ua.player_id
        join teams t on t.team = coalesce(pr.team, ua.u_team)
        left join dk on dk.player_id = coalesce(pr.player_id, ua.player_id)
      )
      select c.*, coalesce(p.display_name, c.player_id) as display_name
      from combined c
      left join raw.players p on p.gsis_id = c.player_id
      order by c.game_id, c.team, coalesce(c.fpts_dk_mean, c.yr_fpts_pg, 0) desc`;

    const out: Record<string, FieldSkillPlayer[]> = {};
    for (const r of rows) {
      const gid = String(r.game_id);
      const list = out[gid] ?? (out[gid] = []);
      list.push({
        player_id: String(r.player_id),
        display_name: String(r.display_name),
        position: String(r.position ?? "WR"),
        team: String(r.team),
        game_id: gid,
        salary: r.salary != null ? Number(r.salary) : null,
        fpts_dk_mean: r.fpts_dk_mean != null ? Number(r.fpts_dk_mean) : null,
        yr_target_share: r.yr_target_share != null ? Number(r.yr_target_share) : null,
        mth_target_share: r.mth_target_share != null ? Number(r.mth_target_share) : null,
        yr_snap_pct: r.yr_snap_pct != null ? Number(r.yr_snap_pct) : null,
        mth_snap_pct: r.mth_snap_pct != null ? Number(r.mth_snap_pct) : null,
        yr_fpts_pg: r.yr_fpts_pg != null ? Number(r.yr_fpts_pg) : null,
        mth_fpts_pg: r.mth_fpts_pg != null ? Number(r.mth_fpts_pg) : null,
        yr_opps_pg: r.yr_opps_pg != null ? Number(r.yr_opps_pg) : null,
        mth_opps_pg: r.mth_opps_pg != null ? Number(r.mth_opps_pg) : null,
        yr_yprr: r.yr_yprr != null ? Number(r.yr_yprr) : null,
        mth_yprr: r.mth_yprr != null ? Number(r.mth_yprr) : null,
      });
    }
    return out;
  } catch {
    return {};
  }
}

