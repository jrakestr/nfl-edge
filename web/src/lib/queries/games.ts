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
