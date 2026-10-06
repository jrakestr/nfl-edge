-- FantasyPros cross-reference for the League of Champions week pages. Read-only views over
-- raw.fantasypros_snapshots (written by nfl-edge ingest fantasypros-injury-reports / fantasypros-points,
-- append-only, keyed by fetched_at). Nothing in sim/ or priors/ reads them.
--
-- ESPN player names are matched to FantasyPros rows by a normalized name key (case, punctuation, and
-- generational suffix removed), preferring the same NFL team. A key that several FantasyPros players share
-- is flagged `ambiguous`, never silently picked. Unmatched players stay in the output with fp_matched false.
--
--  loc_starter_fp_injury   week report per stored player-week: status, practice days, probability of playing,
--                          update date (UTC), the pull time, and known_before_kickoff = the update date is on
--                          or before kickoff (null when the row has no update date). A past week's report is
--                          not a kickoff snapshot: practice and probability fields carry no timestamp.
--  loc_player_week_check   ESPN actual points next to FantasyPros PPR points for the same player-week.

create or replace function fantasy.loc_name_key(n text) returns text
language sql immutable as $$
  select regexp_replace(
           regexp_replace(lower(coalesce(n, '')), '\s+(jr|sr|ii|iii|iv|v)\.?\s*$', ''),
           '[^a-z]', '', 'g')
$$;

create or replace view fantasy.loc_starter_fp_injury as
with fp as (
  select distinct on (f.season, f.week, f.fp_id)
         f.season, f.week, f.fp_id, f.team, f.fetched_at, f.payload,
         fantasy.loc_name_key(f.name) as nkey
    from raw.fantasypros_snapshots f
   where f.endpoint = 'injuries'
   order by f.season, f.week, f.fp_id, f.fetched_at desc
), k as (
  select a.season, a.week, a.espn_team_id, a.player, a.position, a.nfl_team, a.slot, a.proj_pts,
         a.actual_pts, a.kickoff,
         case a.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else a.nfl_team end as sched_team,
         fantasy.loc_name_key(a.player) as nkey
    from fantasy.loc_starter_status_asof a
), j as (
  select k.*, fp.fp_id, fp.fetched_at, fp.payload, fp.team as fp_team,
         count(fp.fp_id) over (partition by k.season, k.week, k.espn_team_id, k.player) as n_candidates
    from k
    left join fp on fp.season = k.season and fp.week = k.week and fp.nkey = k.nkey
), pick as (
  select distinct on (j.season, j.week, j.espn_team_id, j.player) j.*
    from j
   order by j.season, j.week, j.espn_team_id, j.player,
            (j.fp_team = j.sched_team) desc nulls last, j.fetched_at desc nulls last
)
select p.season, p.week, p.espn_team_id, p.player, p.position, p.nfl_team, p.slot,
       p.proj_pts, p.actual_pts, p.kickoff,
       p.fp_id is not null as fp_matched,
       p.n_candidates > 1 as ambiguous,
       p.fp_id,
       nullif(p.payload ->> 'status_short', '') as fp_status,
       nullif(p.payload ->> 'status', '') as fp_status_name,
       nullif(p.payload ->> 'injury_type', '') as injury_type,
       nullif(p.payload ->> 'practice_1', '') as practice_1,
       nullif(p.payload ->> 'practice_2', '') as practice_2,
       nullif(p.payload ->> 'practice_3', '') as practice_3,
       nullif(p.payload ->> 'practice_report_injury_type', '') as practice_injury_type,
       nullif(p.payload ->> 'probability_of_playing', '')::float8 as probability_of_playing,
       (nullif(p.payload ->> 'injury_update_date', '')::timestamp at time zone 'UTC') as injury_update_date,
       p.fetched_at as fp_fetched_at,
       case when nullif(p.payload ->> 'injury_update_date', '') is null or p.kickoff is null then null
            else (nullif(p.payload ->> 'injury_update_date', '')::timestamp at time zone 'UTC') <= p.kickoff
       end as known_before_kickoff
from pick p;

create or replace view fantasy.loc_player_week_check as
with fp as (
  select distinct on (f.season, f.week, f.fp_id)
         f.season, f.week, f.fp_id, f.team, f.fetched_at,
         (f.payload ->> 'points')::float8 as fp_points,
         fantasy.loc_name_key(f.name) as nkey
    from raw.fantasypros_snapshots f
   where f.endpoint = 'player_points'
   order by f.season, f.week, f.fp_id, f.fetched_at desc
), k as (
  select s.season, s.week, s.espn_team_id, s.player, s.position, s.nfl_team, s.slot, s.actual_pts,
         case s.nfl_team when 'LAR' then 'LA' when 'WSH' then 'WAS' else s.nfl_team end as sched_team,
         fantasy.loc_name_key(s.player) as nkey
    from fantasy.loc_player_week_scores s
), j as (
  select k.*, fp.fp_id, fp.fp_points, fp.fetched_at, fp.team as fp_team,
         count(fp.fp_id) over (partition by k.season, k.week, k.espn_team_id, k.player) as n_candidates
    from k
    left join fp on fp.season = k.season and fp.week = k.week and fp.nkey = k.nkey
), pick as (
  select distinct on (j.season, j.week, j.espn_team_id, j.player) j.*
    from j
   order by j.season, j.week, j.espn_team_id, j.player,
            (j.fp_team = j.sched_team) desc nulls last, j.fetched_at desc nulls last
)
select p.season, p.week, p.espn_team_id, p.player, p.position, p.nfl_team, p.slot,
       p.position in ('QB', 'RB', 'WR', 'TE') as comparable,   -- FantasyPros points cover offense only
       p.actual_pts::float8 as espn_actual,
       p.fp_points,
       p.actual_pts::float8 - p.fp_points as diff,
       p.fp_id is null as no_match,
       p.n_candidates > 1 as ambiguous,
       p.fetched_at as fp_fetched_at
from pick p;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on fantasy.loc_starter_fp_injury, fantasy.loc_player_week_check to web_reader;
    grant execute on function fantasy.loc_name_key(text) to web_reader;
  end if;
end
$$;
