import { sql } from "@/lib/db";
import {
  CorrPairSchema,
  HistSchema,
  PlayerWeekSchema,
  PropEdgeSchema,
  PropSnapSchema,
  type CorrPair,
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

/** Newest-run over-side prop edges, sorted by |edge|. */
export async function propEdges(runId: string): Promise<PropEdge[]> {
  const rows = await sql()`
    select e.market_prop_id::int,
           e.player_id,
           coalesce(pl.display_name, mp.player_name) as player_name,
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
