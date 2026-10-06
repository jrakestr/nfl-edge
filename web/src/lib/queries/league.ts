/**
 * Read-only League of Champions queries (schema `fantasy`, ESPN league 79530409).
 * Every number is a stored column: luck is fantasy.loc_luck (Python), margins/ranks/running totals are
 * fantasy.loc_team_week, status is fantasy.loc_starter_status_asof (our own pre-kickoff snapshots), and
 * the FantasyPros cross-reference is fantasy.loc_starter_fp_injury / loc_player_week_check.
 * The waiver wire reads stored model.proj_players means for the complete run of the pool's week.
 * Nothing is recomputed here.
 */
import { sql } from "@/lib/db";
import {
  VIEWER_ESPN_TEAM_ID,
  type AvailablePlayer,
  type LeagueTeamWeek,
  type LuckFit,
  type LuckRow,
  type PlayerCheckRow,
  WIRE_TEAM,
  rosPprRank,
  type AcquireRow,
  type RosterRow,
  type StandingRow,
  type StarterProj,
  type StarterRow,
  type TeamInfo,
  type TxnRow,
  type WeekState,
} from "@/lib/league";
import { runForWeek } from "@/lib/queries/runs";

/** timestamptz comes back as Date; hand client code plain ISO strings. */
function iso(v: unknown): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : String(v);
}

export async function leagueTeams(season: number): Promise<TeamInfo[]> {
  const rows = await sql()`
    select espn_team_id, team, abbrev, owner, faab_spent, faab_remaining, acquisitions, drops, trades, as_of
    from fantasy.loc_teams
    where season = ${season}
    order by espn_team_id`;
  return rows.map((r) => ({ ...(r as unknown as TeamInfo), as_of: iso(r.as_of) ?? "" }));
}

/** Which weeks exist and whether every team row in each is final. */
export async function leagueWeekStates(season: number): Promise<WeekState[]> {
  const rows = await sql()`
    select week, bool_and(is_final) as is_final
    from fantasy.loc_team_week
    where season = ${season}
    group by week
    order by week`;
  return rows.map((r) => ({ week: Number(r.week), is_final: Boolean(r.is_final) }));
}

export async function leagueStandings(season: number): Promise<StandingRow[]> {
  const rows = await sql()`
    select t.espn_team_id, s.team, t.owner,
           s.wins::int as wins, s.losses::int as losses, s.ties::int as ties,
           s.pf::float8 as pf, s.pa::float8 as pa, s.proj_pf::float8 as proj_pf,
           s.plus_minus::float8 as plus_minus,
           s.allplay_wins::float8 as allplay_wins, s.allplay_losses::float8 as allplay_losses,
           s.pts_back_of_pf_leader::float8 as pts_back_of_pf_leader, s.all_final
    from fantasy.loc_standings s
    join fantasy.loc_teams t on t.season = s.season and t.team = s.team
    where s.season = ${season}
    order by s.wins desc, s.ties desc, s.pf desc`;
  return rows as unknown as StandingRow[];
}

/**
 * Team-weeks from fantasy.loc_team_week. Pass `week` for one week (ranked), `teamId` for one team
 * (by week), neither for the whole season (by team, then week).
 */
export async function leagueTeamWeeks(
  season: number,
  opts: { week?: number; teamId?: number } = {},
): Promise<LeagueTeamWeek[]> {
  const week = opts.week ?? null;
  const teamId = opts.teamId ?? null;
  const rows = await sql()`
    select w.season, w.week, w.espn_team_id, w.team, w.opp_espn_team_id, w.opp_team, w.is_final,
           w.proj_pts::float8 as proj_pts, w.actual_pts::float8 as actual_pts,
           w.opp_proj_pts::float8 as opp_proj_pts, w.opp_actual_pts::float8 as opp_actual_pts,
           w.own_pm::float8 as own_pm, w.opp_pm::float8 as opp_pm,
           w.proj_margin::float8 as proj_margin, w.actual_margin::float8 as actual_margin, w.swing::float8 as swing,
           w.win::float8 as win, w.week_rank::int as week_rank,
           w.league_avg::float8 as league_avg, w.league_sd::float8 as league_sd,
           w.sd_from_avg::float8 as sd_from_avg,
           w.allplay_wins::int as allplay_wins, w.allplay_losses::int as allplay_losses,
           w.cum_pf::float8 as cum_pf, w.cum_pf_rank::int as cum_pf_rank,
           w.pts_back_of_pf_leader::float8 as pts_back_of_pf_leader, w.cum_pa::float8 as cum_pa,
           (l.actual_win - l.earned_win_prob)::float8 as luck
    from fantasy.loc_team_week w
    left join fantasy.loc_luck l
      on l.season = w.season and l.week = w.week and l.espn_team_id = w.espn_team_id
    where w.season = ${season}
      and (${week}::int is null or w.week = ${week}::int)
      and (${teamId}::int is null or w.espn_team_id = ${teamId}::int)
    order by w.week, w.week_rank, w.team`;
  const out = rows as unknown as LeagueTeamWeek[];
  return week == null && teamId == null
    ? [...out].sort((a, b) => a.team.localeCompare(b.team) || a.week - b.week)
    : out;
}

/** Season luck per team from fantasy.loc_luck, plus the fitted model it was computed with. */
export async function leagueLuck(season: number): Promise<{ rows: LuckRow[]; fit: LuckFit | null }> {
  const rows = await sql()`
    select l.espn_team_id, t.team,
           sum(l.proj_win_prob)::float8 as proj_wins,
           sum(l.earned_win_prob)::float8 as earned_wins,
           sum(l.actual_win)::float8 as actual_wins,
           (sum(l.actual_win) - sum(l.earned_win_prob))::float8 as luck,
           (sum(l.actual_win) - sum(l.allplay_share))::float8 as luck_allplay
    from fantasy.loc_luck l
    join fantasy.loc_teams t on t.season = l.season and t.espn_team_id = l.espn_team_id
    where l.season = ${season}
    group by l.espn_team_id, t.team
    order by luck desc`;
  const fit = await sql()`
    select max(bias)::float8 as bias, max(sd)::float8 as sd, max(n_team_weeks)::int as n_team_weeks,
           count(distinct week)::int as weeks, max(computed_at) as computed_at
    from fantasy.loc_luck
    where season = ${season}`;
  const f = fit[0];
  return {
    rows: rows as unknown as LuckRow[],
    fit:
      f && f.bias != null
        ? {
            bias: Number(f.bias),
            sd: Number(f.sd),
            n_team_weeks: Number(f.n_team_weeks),
            weeks: Number(f.weeks),
            computed_at: iso(f.computed_at) ?? "",
          }
        : null,
  };
}

/**
 * Starters for one week with the pre-kickoff status we captured, the FantasyPros injury report, and
 * FantasyPros points for the same player-week. Joined on the keys the views already carry.
 */
export async function leagueStarters(season: number, week: number): Promise<StarterRow[]> {
  const rows = await sql()`
    select a.espn_team_id, t.team, a.player, a.position, a.nfl_team, a.slot,
           a.proj_pts::float8 as proj_pts, a.actual_pts::float8 as actual_pts,
           a.kickoff, a.snapshot_status, a.snapshot_pulled_at,
           coalesce(f.fp_matched, false) as fp_matched,
           f.fp_status_name as fp_status, f.practice_1, f.practice_2, f.practice_3,
           f.probability_of_playing::float8 as probability_of_playing,
           f.injury_update_date, f.known_before_kickoff, f.fp_fetched_at,
           c.fp_points::float8 as fp_points
    from fantasy.loc_starter_status_asof a
    join fantasy.loc_teams t on t.season = a.season and t.espn_team_id = a.espn_team_id
    left join fantasy.loc_starter_fp_injury f
      on f.season = a.season and f.week = a.week and f.espn_team_id = a.espn_team_id
     and f.player = a.player and f.slot = a.slot
    left join fantasy.loc_player_week_check c
      on c.season = a.season and c.week = a.week and c.espn_team_id = a.espn_team_id
     and c.player = a.player and c.slot = a.slot
    where a.season = ${season} and a.week = ${week}
    order by t.team, a.slot, a.player`;
  return rows.map((r) => ({
    ...(r as unknown as StarterRow),
    kickoff: iso(r.kickoff),
    snapshot_pulled_at: iso(r.snapshot_pulled_at),
    injury_update_date: iso(r.injury_update_date),
    fp_fetched_at: iso(r.fp_fetched_at),
  }));
}

/** ESPN-vs-FantasyPros points for one week, to show where the two sources disagree. */
export async function leaguePlayerChecks(season: number, week: number): Promise<PlayerCheckRow[]> {
  const rows = await sql()`
    select c.espn_team_id, t.team, c.player, c.position, c.slot, c.comparable,
           c.espn_actual::float8 as espn_actual, c.fp_points::float8 as fp_points,
           c.diff::float8 as diff, c.no_match
    from fantasy.loc_player_week_check c
    join fantasy.loc_teams t on t.season = c.season and t.espn_team_id = c.espn_team_id
    where c.season = ${season} and c.week = ${week}
    order by abs(c.diff) desc nulls last, t.team, c.player`;
  return rows as unknown as PlayerCheckRow[];
}

export type LeagueRoster = { rows: RosterRow[]; rankingsPulledAt: string | null };

/** Current roster plus the newest FantasyPros rankings snapshot for the season. One gsis match or no rank. */
export async function leagueRoster(season: number, teamId: number): Promise<LeagueRoster> {
  const rows = await sql()`
    select r.player, r.position, r.nfl_team, r.slot, r.status_at_pull,
           r.season_pts::float8 as season_pts, r.season_proj::float8 as season_proj, r.pulled_at,
           s.payload as fp_payload,
           (select max(f.fetched_at) from raw.fantasypros_snapshots f
             where f.endpoint = 'rankings' and f.season = ${season}) as rankings_pulled_at
    from fantasy.loc_rosters r
    left join lateral (
      select case when count(*) = 1 then min(p.gsis_id) end as player_id
      from raw.players p
      where fantasy.loc_name_key(p.display_name) = fantasy.loc_name_key(r.player)
        and p.latest_team = case r.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else r.nfl_team end
    ) m on true
    left join lateral (
      select f.payload
      from raw.fantasypros_snapshots f
      where f.endpoint = 'rankings' and f.season = ${season} and f.player_id = m.player_id
      order by f.fetched_at desc
      limit 1
    ) s on true
    where r.season = ${season} and r.espn_team_id = ${teamId}
    order by case r.slot when 'BE' then 2 when 'IR' then 3 else 1 end, r.slot, r.player`;
  const mapped = rows.map((r) => {
    const position = (r.position as string | null) ?? (r.slot as string | null);
    return {
      player: String(r.player),
      position: (r.position as string | null) ?? null,
      nfl_team: (r.nfl_team as string | null) ?? null,
      slot: String(r.slot),
      status_at_pull: (r.status_at_pull as string | null) ?? null,
      season_pts: r.season_pts == null ? null : Number(r.season_pts),
      season_proj: r.season_proj == null ? null : Number(r.season_proj),
      pulled_at: iso(r.pulled_at) ?? "",
      fp_rank: rosPprRank(r.fp_payload, position),
    } satisfies RosterRow;
  });
  return { rows: mapped, rankingsPulledAt: iso(rows[0]?.rankings_pulled_at) };
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function acquireFrom(r: Record<string, unknown>, source: "roster" | "wire"): AcquireRow {
  const position = (r.position as string | null) ?? (source === "roster" ? (r.slot as string | null) : null);
  return {
    source,
    player: String(r.player),
    position: (r.position as string | null) ?? null,
    nfl_team: (r.nfl_team as string | null) ?? null,
    espn_team_id: source === "roster" ? Number(r.espn_team_id) : null,
    espn_player_id: source === "wire" ? Number(r.espn_player_id) : null,
    team: source === "wire" ? WIRE_TEAM : String(r.team),
    slot: (r.slot as string | null) ?? null,
    availability: (r.availability as string | null) ?? null,
    status_at_pull: (r.status_at_pull as string | null) ?? null,
    season_pts: numOrNull(r.season_pts),
    season_proj: numOrNull(r.season_proj),
    fp_rank: rosPprRank(r.fp_payload, position),
    games_played: Number(r.games_played ?? 0) || 0,
  };
}

/** Latest roster week plus the current available pool. One gsis match or no rank. */
export async function leagueAcquire(season: number): Promise<AcquireRow[]> {
  const roster = await sql()`
    select r.player, r.position, r.nfl_team, r.espn_team_id, t.team, r.slot,
           r.status_at_pull, r.season_pts::float8 as season_pts, r.season_proj::float8 as season_proj,
           s.payload as fp_payload, gp.games_played
    from fantasy.loc_rosters r
    join fantasy.loc_teams t on t.season = r.season and t.espn_team_id = r.espn_team_id
    left join lateral (
      select case when count(*) = 1 then min(p.gsis_id) end as player_id
      from raw.players p
      where fantasy.loc_name_key(p.display_name) = fantasy.loc_name_key(r.player)
        and p.latest_team = case r.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else r.nfl_team end
    ) m on true
    left join lateral (
      select f.payload
      from raw.fantasypros_snapshots f
      where f.endpoint = 'rankings' and f.season = ${season} and f.player_id = m.player_id
      order by f.fetched_at desc
      limit 1
    ) s on true
    left join lateral (
      select case
        when r.position = 'D/ST' then (
          select count(distinct sch.week)::int
          from raw.schedules sch
          where sch.season = ${season} and sch.game_type = 'REG' and sch.week between 1 and 18
            and sch.result is not null
            and (sch.home_team = case r.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else r.nfl_team end
              or sch.away_team = case r.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else r.nfl_team end)
        )
        else (
          select count(distinct w.week)::int
          from raw.player_stats_weekly w
          where w.season = ${season} and w.player_id = m.player_id and w.week between 1 and 18
        )
      end as games_played
    ) gp on true
    where r.season = ${season}
      and r.week = (select max(w.week) from fantasy.loc_rosters w where w.season = ${season})`;
  const wire = await sql()`
    select a.espn_player_id, a.player, a.position, a.nfl_team, a.availability, a.injury_status as status_at_pull,
           a.season_pts::float8 as season_pts, a.season_proj::float8 as season_proj,
           s.payload as fp_payload, gp.games_played
    from fantasy.loc_available a
    left join lateral (
      select case when count(*) = 1 then min(p.gsis_id) end as player_id
      from raw.players p
      where p.espn_id = a.espn_player_id::text
    ) m on true
    left join lateral (
      select f.payload
      from raw.fantasypros_snapshots f
      where f.endpoint = 'rankings' and f.season = ${season} and f.player_id = m.player_id
      order by f.fetched_at desc
      limit 1
    ) s on true
    left join lateral (
      select case
        when a.position = 'D/ST' then (
          select count(distinct sch.week)::int
          from raw.schedules sch
          where sch.season = ${season} and sch.game_type = 'REG' and sch.week between 1 and 18
            and sch.result is not null
            and (sch.home_team = case a.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else a.nfl_team end
              or sch.away_team = case a.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else a.nfl_team end)
        )
        else (
          select count(distinct w.week)::int
          from raw.player_stats_weekly w
          where w.season = ${season} and w.player_id = m.player_id and w.week between 1 and 18
        )
      end as games_played
    ) gp on true
    where a.season = ${season}`;
  return [
    ...roster.map((r) => acquireFrom(r as Record<string, unknown>, "roster")),
    ...wire.map((r) => acquireFrom(r as Record<string, unknown>, "wire")),
  ];
}

/** All transactions, newest first. ESPN stamps are Phoenix local; converted to an instant here. */
export async function leagueTransactions(season: number): Promise<TxnRow[]> {
  const rows = await sql()`
    select x.id::int as id, x.week, (x.espn_ts at time zone 'America/Phoenix') as espn_ts,
           x.espn_team_id, t.team, x.txn_type, x.status, x.bid, x.item_type, x.player, x.group_key
    from fantasy.loc_transactions x
    join fantasy.loc_teams t on t.season = x.season and t.espn_team_id = x.espn_team_id
    where x.season = ${season}
    order by x.espn_ts desc nulls last, x.id`;
  return rows.map((r) => ({ ...(r as unknown as TxnRow), espn_ts: iso(r.espn_ts) }));
}

export type LeagueClock = { seasonWeeks: number; weeksDone: number };

/** Fantasy season length and how many weeks are fully final. A week still in progress does not count. */
export async function leagueClock(season: number): Promise<LeagueClock> {
  const rows = await sql()`
    select
      (select regular_season_weeks from fantasy.loc_league_settings where season = ${season})::int as season_weeks,
      (select count(*)::int from (
         select week from fantasy.loc_team_week
         where season = ${season}
         group by week
         having bool_and(is_final)
       ) final_weeks) as weeks_done`;
  const row = rows[0];
  return {
    seasonWeeks: Number(row?.season_weeks ?? 0) || 0,
    weeksDone: Number(row?.weeks_done ?? 0) || 0,
  };
}

type PoolRow = {
  espn_player_id: number;
  player: string;
  position: string | null;
  nfl_team: string | null;
  injury_status: string | null;
  availability: string;
  percent_owned: number | null;
  on_bye: boolean;
  waiver_at: Date | string | null;
  week: number;
  pulled_at: Date | string;
  player_id: string | null;
};

type ProjRow = { player_id: string; ppr: number | null; dk: number | null };

/** Available pool for the season, joined to the complete sim run for the week ESPN stamped on it. */
export async function leagueWire(season: number): Promise<{
  week: number | null;
  runId: string | null;
  available: AvailablePlayer[];
  starters: StarterProj[];
}> {
  const pool = await sql()`
    select a.espn_player_id, a.player, a.position, a.nfl_team, a.injury_status, a.availability,
           a.percent_owned::float8 as percent_owned, a.on_bye, a.waiver_at, a.week, a.pulled_at,
           m.player_id
    from fantasy.loc_available a
    left join lateral (
      select case when count(*) = 1 then min(p.gsis_id) end as player_id
      from raw.players p
      where p.espn_id = a.espn_player_id::text
    ) m on true
    where a.season = ${season}
    order by a.percent_owned desc nulls last, a.player`;
  const rows = pool as unknown as PoolRow[];
  const week = rows[0]?.week ?? null;
  const run = week == null ? null : await runForWeek(season, week);
  const ids = [...new Set(rows.map((r) => r.player_id).filter((id): id is string => !!id))];
  const proj = new Map<string, ProjRow>();
  if (run && ids.length > 0) {
    const scored = await sql()`
      select player_id,
             (stat_summary->'fpts_ppr'->>'mean')::float8 as ppr,
             fpts_dk_mean::float8 as dk
      from model.proj_players
      where run_id = ${run.run_id} and player_id = any(${ids})`;
    for (const row of scored as unknown as ProjRow[]) proj.set(row.player_id, row);
  }
  const available: AvailablePlayer[] = rows.map((r) => {
    const hit = r.player_id ? proj.get(r.player_id) : undefined;
    return {
      espn_player_id: r.espn_player_id,
      player: r.player,
      position: r.position,
      nfl_team: r.nfl_team,
      injury_status: r.injury_status,
      availability: r.availability,
      percent_owned: r.percent_owned == null ? null : Number(r.percent_owned),
      on_bye: r.on_bye,
      waiver_at: iso(r.waiver_at),
      week: r.week,
      pulled_at: iso(r.pulled_at) ?? "",
      player_id: r.player_id,
      ppr: hit?.ppr == null ? null : Number(hit.ppr),
      dk: hit?.dk == null ? null : Number(hit.dk),
    };
  });
  const starters = await viewerStarters(season, run?.run_id ?? null);
  return { week, runId: run?.run_id ?? null, available, starters };
}

async function viewerStarters(season: number, runId: string | null): Promise<StarterProj[]> {
  const rows = await sql()`
    select r.player, r.position, r.slot, r.nfl_team,
           (j.stat_summary->'fpts_ppr'->>'mean')::float8 as ppr
    from fantasy.loc_rosters r
    left join lateral (
      select case when count(*) = 1 then min(p.gsis_id) end as player_id
      from raw.players p
      where fantasy.loc_name_key(p.display_name) = fantasy.loc_name_key(r.player)
        and p.latest_team = case r.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else r.nfl_team end
    ) m on true
    left join model.proj_players j
      on j.run_id = ${runId} and j.player_id = m.player_id
    where r.season = ${season} and r.espn_team_id = ${VIEWER_ESPN_TEAM_ID}
      and r.slot not in ('BE', 'IR')`;
  return (rows as unknown as StarterProj[]).map((r) => ({
    ...r,
    ppr: r.ppr == null ? null : Number(r.ppr),
  }));
}
