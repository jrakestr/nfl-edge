import { sql } from "@/lib/db";
import type { PlayerActualWeek } from "@/lib/player-actuals";
import {
  CorrPairSchema,
  FairPropSchema,
  HistSchema,
  PlayerWeekSchema,
  PropEdgeSchema,
  PropSnapSchema,
  type CorrPair,
  type FairProp,
  type Hist,
  type MatchupRow,
  type PlayerWeek,
  type PropEdge,
  type PropSnap,
} from "@/lib/types";

function histFrom(raw: unknown): Hist | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = HistSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** One row per player-stat on the run. Market columns are null until a line is entered. */
export async function fairProps(runId: string): Promise<FairProp[]> {
  const rows = await sql()`
    with run as (
      select season, week from model.sim_runs where run_id = ${runId}::uuid
    ),
    mkt as (
      select distinct on (mp.player_id, mp.stat)
             mp.id, mp.player_id, mp.stat, mp.line::float8 as line, mp.over_odds, mp.under_odds
      from model.market_props mp
      join run on mp.season = run.season and mp.week = run.week
      where mp.player_id is not null
      order by mp.player_id, mp.stat, mp.captured_at desc, mp.id desc
    )
    select f.player_id,
           coalesce(pl.display_name, f.player_id) as player_name,
           pp.position,
           pp.team,
           case when pp.team = s.home_team then s.away_team else s.home_team end as opponent,
           pp.game_id,
           s.home_team as home,
           s.away_team as away,
           f.stat,
           f.fair_line::float8 as fair_line,
           f.p_over::float8 as p_over,
           f.p10::float8 as p10,
           f.p25::float8 as p25,
           f.p75::float8 as p75,
           f.p90::float8 as p90,
           f.mean::float8 as mean,
           f.sentence,
           pp.fpts_dk_mean::float8 as fpts_dk_mean,
           case when f.stat = 'anytime_td' then null else pp.stat_summary -> f.stat -> 'hist' end as hist,
           m.line::float8 as market_line,
           e.p_over::float8 as market_p_over,
           e.edge::float8 as edge,
           e.lean,
           m.over_odds,
           m.under_odds,
           e.sentence as market_sentence
    from model.fair_props f
    join model.proj_players pp on pp.run_id = f.run_id and pp.player_id = f.player_id
    left join raw.players pl on pl.gsis_id = f.player_id
    left join raw.schedules s on s.game_id = pp.game_id
    left join mkt m on m.player_id = f.player_id and m.stat = f.stat
    left join model.prop_edges e
      on e.run_id = f.run_id and e.player_id = f.player_id and e.stat = f.stat
     and e.side = 'over' and e.market_prop_id = m.id
    where f.run_id = ${runId}::uuid
    order by pp.fpts_dk_mean desc nulls last, coalesce(pl.display_name, f.player_id), f.stat`;
  return rows.map((r) => FairPropSchema.parse({ ...r, hist: histFrom(r.hist) }));
}

export async function playerFairProps(runId: string, playerId: string): Promise<FairProp[]> {
  return (await fairProps(runId)).filter((r) => r.player_id === playerId);
}

/** Newest-run over-side prop edges, sorted by |edge|. */
export async function propEdges(runId: string): Promise<PropEdge[]> {
  const rows = await sql()`
    select e.market_prop_id::int,
           e.player_id,
           coalesce(pl.display_name, mp.player_name) as player_name,
           coalesce(pp.position, pl.position) as position,
           e.game_id,
           s.home_team as home,
           s.away_team as away,
           e.stat,
           e.line::float8 as line,
           e.p_over::float8 as p_over,
           e.model_prob::float8 as model_prob,
           e.market_prob::float8 as market_prob,
           e.edge::float8 as edge,
           e.kelly_fraction::float8 as kelly_fraction,
           e.price,
           mp.over_odds,
           mp.under_odds,
           e.sentence,
           e.lean,
           (pp.stat_summary -> e.stat -> 'mean')::float8 as typical
    from model.prop_edges e
    join model.market_props mp on mp.id = e.market_prop_id
    left join raw.players pl on pl.gsis_id = e.player_id
    left join raw.schedules s on s.game_id = e.game_id
    left join model.proj_players pp on pp.run_id = e.run_id and pp.player_id = e.player_id
    where e.run_id = ${runId}::uuid and e.side = 'over'
    order by abs(e.edge) desc nulls last, e.player_id`;
  return rows.map((r) => PropEdgeSchema.parse(r));
}

export async function playerPropEdges(runId: string, playerId: string): Promise<PropEdge[]> {
  const all = await propEdges(runId);
  return all.filter((e) => e.player_id === playerId);
}

export async function propHistogram(runId: string, playerId: string, stat: string): Promise<Hist | null> {
  const rows = await sql()`
    select stat_summary -> ${stat} -> 'hist' as hist
    from model.proj_players
    where run_id = ${runId}::uuid and player_id = ${playerId}
    limit 1`;
  return histFrom(rows[0]?.hist);
}

export async function propTimeline(season: number, week: number, playerId: string, stat: string): Promise<PropSnap[]> {
  const rows = await sql()`
    select captured_at::text, line::float8 as line, over_odds, under_odds
    from model.market_props
    where season = ${season} and week = ${week} and player_id = ${playerId} and stat = ${stat}
    order by captured_at`;
  return rows.map((r) => PropSnapSchema.parse(r));
}

export async function playerLog(playerId: string, limit = 20): Promise<PlayerWeek[]> {
  const rows = await sql()`
    select p.season, p.week, to_char(s.gameday, 'YYYY-MM-DD') as gameday,
           p.opponent_team as opponent, p.team,
           s.home_team as home, s.away_team as away,
           s.home_score, s.away_score, p.stats
    from raw.player_stats_weekly p
    left join raw.schedules s
      on s.season = p.season and s.week = p.week
     and (s.home_team = p.team or s.away_team = p.team)
     and s.game_type = 'REG'
    where p.player_id = ${playerId}
    order by p.season desc, p.week desc
    limit ${limit}`;
  return rows.map((r) => PlayerWeekSchema.parse({ ...r, stats: r.stats ?? {} }));
}

export async function playerFptsActual(playerId: string): Promise<PlayerActualWeek[]> {
  const rows = await sql()`
    select a.season, a.week, a.opponent, a.fpts_dk::float8 as fpts_dk,
           a.had_opportunity, to_char(s.gameday, 'YYYY-MM-DD') as gameday
    from model.player_fpts_actual a
    left join raw.schedules s
      on s.season = a.season and s.week = a.week
     and (s.home_team = a.team or s.away_team = a.team)
     and s.game_type = 'REG'
    where a.player_id = ${playerId}
    order by a.season desc, a.week desc`;
  return rows.map((r) => ({
    season: Number(r.season),
    week: Number(r.week),
    opponent: r.opponent != null ? String(r.opponent) : null,
    gameday: r.gameday != null ? String(r.gameday) : null,
    fpts_dk: Number(r.fpts_dk),
    had_opportunity: Boolean(r.had_opportunity),
  }));
}

export async function playerCorrs(runId: string, playerId: string): Promise<CorrPair[]> {
  const rows = await sql()`
    select case
             when c.player_id_a = ${playerId} then coalesce(pb.display_name, c.player_id_b)
             else coalesce(pa.display_name, c.player_id_a)
           end as a,
           ${playerId} as b,
           c.corr_dk::float8 as corr
    from model.player_correlations c
    left join raw.players pa on pa.gsis_id = c.player_id_a
    left join raw.players pb on pb.gsis_id = c.player_id_b
    where c.run_id = ${runId}::uuid
      and (c.player_id_a = ${playerId} or c.player_id_b = ${playerId})
      and c.corr_dk is not null
    order by abs(c.corr_dk) desc
    limit 8`;
  return rows.map((r) => CorrPairSchema.parse(r));
}

export async function matchupRows(team: string | null, opponent: string | null): Promise<MatchupRow[]> {
  if (!opponent) return [];
  const rows = await sql()`
    select avg(a.points)::float8 as pts,
           avg(o.points)::float8 as pts_allowed,
           avg(a.pass_rate)::float8 as pass_rate,
           avg(a.epa_per_play)::float8 as epa,
           avg(a.plays)::float8 as plays
    from raw.team_game_agg a
    join raw.team_game_agg o on o.game_id = a.game_id and o.team = a.opponent
    where a.team = ${opponent} and a.season = 2025`;
  const r = rows[0];
  if (!r || r.pts == null) return [];
  const vs = team ? ` vs ${team}` : "";
  return [
    { label: "Points scored / game", value: Number(r.pts).toFixed(1) },
    { label: "Points allowed / game", value: Number(r.pts_allowed).toFixed(1) },
    { label: "Pass rate", value: `${Math.round(Number(r.pass_rate) * 100)}%` },
    { label: "EPA / play", value: Number(r.epa).toFixed(2) },
    { label: `Plays / game${vs}`, value: Number(r.plays).toFixed(1) },
  ];
}
