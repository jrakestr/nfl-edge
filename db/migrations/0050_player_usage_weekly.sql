-- Player usage and rate stats from free data (nflverse weekly stats, PFR snap counts, team
-- weekly stats). DISPLAY ONLY: nothing here feeds the sim or priors.
--
-- One row per player-week with the raw counts, every common scoring variant, and the inputs the
-- rate stats divide by. Routes are not published for 2026 (the league stopped releasing
-- participation data after 2025), so routes_est = offensive snaps * team dropback rate; the web
-- labels it as an estimate. Readers aggregate with `week < W` to honour the as-of rule.
--
-- jsonb_to_record decompresses each stats blob once; extracting keys one by one re-detoasts the
-- row per key and was 3x slower. `week <= 18` is the regular season for every season on file and
-- keeps the index scan from touching the blob on rows that the season_type check would drop.

create or replace view model.player_usage_weekly as
with w as (
  select s.season, s.week, s.player_id, s.position, s.team, s.opponent_team as opponent,
         j.game_id,
         coalesce(j.attempts, 0) as attempts,
         coalesce(j.completions, 0) as completions,
         coalesce(j.passing_yards, 0) as pass_yds,
         coalesce(j.passing_tds, 0) as pass_td,
         coalesce(j.passing_interceptions, j.interceptions, 0) as pass_int,
         coalesce(j.sacks_suffered, 0) as sacks,
         coalesce(j.carries, 0) as carries,
         coalesce(j.rushing_yards, 0) as rush_yds,
         coalesce(j.rushing_tds, 0) as rush_td,
         coalesce(j.targets, 0) as targets,
         coalesce(j.receptions, 0) as receptions,
         coalesce(j.receiving_yards, 0) as rec_yds,
         coalesce(j.receiving_tds, 0) as rec_td,
         coalesce(j.receiving_air_yards, 0) as air_yds,
         j.target_share, j.wopr,
         coalesce(j.rushing_fumbles_lost, 0) + coalesce(j.receiving_fumbles_lost, 0) + coalesce(j.sack_fumbles_lost, 0) as fumbles_lost,
         coalesce(j.passing_2pt_conversions, 0) + coalesce(j.rushing_2pt_conversions, 0) + coalesce(j.receiving_2pt_conversions, 0) as two_pt,
         j.fantasy_points as fpts_std,
         j.fantasy_points_ppr as fpts_ppr
  from raw.player_stats_weekly s
  cross join lateral jsonb_to_record(s.stats) as j(
    game_id text, season_type text,
    attempts float8, completions float8, passing_yards float8, passing_tds float8,
    passing_interceptions float8, interceptions float8, sacks_suffered float8,
    carries float8, rushing_yards float8, rushing_tds float8,
    targets float8, receptions float8, receiving_yards float8, receiving_tds float8, receiving_air_yards float8,
    target_share float8, wopr float8,
    rushing_fumbles_lost float8, receiving_fumbles_lost float8, sack_fumbles_lost float8,
    passing_2pt_conversions float8, rushing_2pt_conversions float8, receiving_2pt_conversions float8,
    fantasy_points float8, fantasy_points_ppr float8)
  where s.week <= 18
    and s.position in ('QB', 'RB', 'WR', 'TE')
    and j.season_type = 'REG'
),
tm as (
  select t.season, t.week, t.team,
         coalesce(j.attempts, 0) + coalesce(j.sacks_suffered, 0) as team_dropbacks,
         coalesce(j.attempts, 0) + coalesce(j.sacks_suffered, 0) + coalesce(j.carries, 0) as team_plays
  from raw.team_stats_weekly t
  cross join lateral jsonb_to_record(t.stats) as j(attempts float8, sacks_suffered float8, carries float8)
),
sn as (
  select c.season, c.week, p.gsis_id as player_id, c.offense_snaps::float8 as offense_snaps, c.offense_pct::float8 as offense_pct
  from raw.snap_counts c
  join raw.players p on p.pfr_id = c.pfr_player_id
  where c.offense_snaps is not null
)
select w.season, w.week, w.player_id,
       coalesce(pl.display_name, w.player_id) as player_name,
       w.position, w.team, w.opponent, w.game_id,
       w.attempts, w.completions, w.pass_yds, w.pass_td, w.pass_int, w.sacks,
       w.attempts + w.sacks as dropbacks,
       w.carries, w.rush_yds, w.rush_td,
       w.targets, w.receptions, w.rec_yds, w.rec_td, w.air_yds, w.target_share, w.wopr,
       w.targets + w.carries as opportunities,
       w.receptions + w.carries as touches,
       w.fumbles_lost, w.two_pt,
       w.fpts_std,
       w.fpts_std + 0.5 * w.receptions as fpts_half,
       w.fpts_ppr,
       -- DraftKings: 4-pt pass TD, -1 INT, +3 at 300 pass / 100 rush / 100 rec, -1 fumble lost
       w.pass_yds * 0.04 + w.pass_td * 4 - w.pass_int
         + w.rush_yds * 0.1 + w.rush_td * 6
         + w.receptions + w.rec_yds * 0.1 + w.rec_td * 6
         - w.fumbles_lost + w.two_pt * 2
         + case when w.pass_yds >= 300 then 3 else 0 end
         + case when w.rush_yds >= 100 then 3 else 0 end
         + case when w.rec_yds >= 100 then 3 else 0 end as fpts_dk,
       -- 6-pt pass TD PPR (ESPN-style leagues)
       w.fpts_ppr + 2 * w.pass_td as fpts_ppr_6pt,
       sn.offense_snaps, sn.offense_pct,
       tm.team_dropbacks, tm.team_plays,
       case when tm.team_plays > 0 and sn.offense_snaps is not null
            then sn.offense_snaps * tm.team_dropbacks / tm.team_plays end as routes_est
from w
left join raw.players pl on pl.gsis_id = w.player_id
left join tm on tm.season = w.season and tm.week = w.week and tm.team = w.team
left join sn on sn.season = w.season and sn.week = w.week and sn.player_id = w.player_id;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.player_usage_weekly to web_reader;
  end if;
end
$$;
