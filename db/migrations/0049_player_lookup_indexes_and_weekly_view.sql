-- 0049: Leading-player_id composite indexes, missing FK indexes, and unified model.player_week_log view.
-- Fixes sequential scans when querying a single player's history across weeks/runs and provides a single
-- database relation joining schedules, weekly stats, actuals, sim projections, and FantasyPros projections.

create index if not exists player_stats_weekly_player_idx
  on raw.player_stats_weekly (player_id, season, week desc);

create index if not exists player_fpts_actual_player_idx
  on model.player_fpts_actual (player_id, season desc, week desc);

create index if not exists proj_players_player_idx
  on model.proj_players (player_id, run_id);

create index if not exists player_proj_actual_player_idx
  on model.player_proj_actual (player_id, season, week);

create index if not exists external_players_player_idx
  on raw.external_players (player_id, source, season, week);

create index if not exists player_correlations_run_b_idx
  on model.player_correlations (run_id, player_id_b);

create index if not exists prop_edges_market_prop_idx
  on model.prop_edges (market_prop_id);


-- CTEs are NOT MATERIALIZED so a `where player_id = $1` on the view pushes into every branch
-- (index scans on the player_id indexes above). Materialized, the same query seq-scans
-- player_stats_weekly and proj_players: ~14.5 s, at the web_reader 15 s statement_timeout.
create or replace view model.player_week_log as
with sim_combined as not materialized (
  select pp.player_id,
         sr.season,
         sr.week,
         pp.team,
         pp.game_id,
         pp.fpts_dk_mean::float8 as sim_dk,
         jsonb_build_object(
           'pass_yds', (pp.stat_summary -> 'pass_yds' ->> 'mean')::float8,
           'pass_td', (pp.stat_summary -> 'pass_td' ->> 'mean')::float8,
           'int', (pp.stat_summary -> 'int' ->> 'mean')::float8,
           'rush_yds', (pp.stat_summary -> 'rush_yds' ->> 'mean')::float8,
           'rush_td', (pp.stat_summary -> 'rush_td' ->> 'mean')::float8,
           'carries', (pp.stat_summary -> 'carries' ->> 'mean')::float8,
           'targets', (pp.stat_summary -> 'targets' ->> 'mean')::float8,
           'rec', (pp.stat_summary -> 'rec' ->> 'mean')::float8,
           'rec_yds', (pp.stat_summary -> 'rec_yds' ->> 'mean')::float8,
           'rec_td', (pp.stat_summary -> 'rec_td' ->> 'mean')::float8
         ) as proj_stats,
         1 as priority,
         sr.created_at
  from model.proj_players pp
  join model.sim_runs sr on sr.run_id = pp.run_id
  where pp.fpts_dk_mean is not null
  union all
  select pa.player_id,
         pa.season,
         pa.week,
         pa.team,
         pa.game_id,
         pa.proj_dk_mean::float8 as sim_dk,
         jsonb_build_object(
           'pass_yds', pa.proj_pass_yds::float8,
           'pass_td', null::float8,
           'int', null::float8,
           'rush_yds', pa.proj_rush_yds::float8,
           'rush_td', null::float8,
           'carries', pa.proj_carries::float8,
           'targets', pa.proj_targets::float8,
           'rec', null::float8,
           'rec_yds', pa.proj_rec_yds::float8,
           'rec_td', null::float8
         ) as proj_stats,
         2 as priority,
         pa.graded_at as created_at
  from model.player_proj_actual pa
  where pa.proj_dk_mean is not null
),
sim_latest as not materialized (
  select distinct on (player_id, season, week)
         player_id, season, week, team, game_id, sim_dk, proj_stats
  from sim_combined
  order by player_id, season, week, priority, created_at desc nulls last
),
fp_latest as not materialized (
  select distinct on (player_id, season, week)
         player_id,
         season,
         week,
         team,
         opponent,
         fpts_dk::float8 as fp_dk,
         jsonb_build_object(
           'pass_yds', pass_yds::float8,
           'pass_td', pass_td::float8,
           'int', pass_int::float8,
           'rush_yds', rush_yds::float8,
           'rush_td', rush_td::float8,
           'carries', rush_att::float8,
           'targets', null::float8,
           'rec', rec::float8,
           'rec_yds', rec_yds::float8,
           'rec_td', rec_td::float8
         ) as fp_stats
  from raw.external_players
  where source = 'fantasypros'
    and player_id is not null
    and fpts_dk is not null
  order by player_id, season, week, ingested_at desc nulls last
),
reg_stats as not materialized (
  select player_id, season, week, team, opponent_team, stats
  from raw.player_stats_weekly
  where stats->>'season_type' = 'REG'
),
reg_actuals as not materialized (
  select player_id, season, week, team, opponent, fpts_dk::float8 as scored_dk, had_opportunity
  from model.player_fpts_actual
  where season_type = 'REG'
),
keys as not materialized (
  select player_id, season, week from reg_stats
  union
  select player_id, season, week from reg_actuals
  union
  select player_id, season, week from sim_latest
  union
  select player_id, season, week from fp_latest
)
select k.player_id,
       k.season,
       k.week,
       coalesce(ra.team, rs.team, sl.team, fl.team) as team,
       coalesce(
         ra.opponent,
         rs.opponent_team,
         fl.opponent,
         case
           when sc.home_team = coalesce(ra.team, rs.team, sl.team, fl.team) then sc.away_team
           when sc.away_team = coalesce(ra.team, rs.team, sl.team, fl.team) then sc.home_team
         end
       ) as opponent,
       to_char(sc.gameday, 'YYYY-MM-DD') as gameday,
       ra.scored_dk,
       ra.had_opportunity,
       sl.sim_dk,
       fl.fp_dk,
       rs.stats,
       coalesce(sl.proj_stats, fl.fp_stats) as proj_stats
from keys k
left join reg_stats rs on rs.player_id = k.player_id and rs.season = k.season and rs.week = k.week
left join reg_actuals ra on ra.player_id = k.player_id and ra.season = k.season and ra.week = k.week
left join sim_latest sl on sl.player_id = k.player_id and sl.season = k.season and sl.week = k.week
left join fp_latest fl on fl.player_id = k.player_id and fl.season = k.season and fl.week = k.week
left join raw.schedules sc
  on sc.season = k.season
 and sc.week = k.week
 and sc.game_type = 'REG'
 and (sc.home_team = coalesce(ra.team, rs.team, sl.team, fl.team)
   or sc.away_team = coalesce(ra.team, rs.team, sl.team, fl.team));

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.player_week_log to web_reader;
  end if;
end
$$;
