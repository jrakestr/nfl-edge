-- League of Champions: tables loaded from the ESPN Fantasy connector (Option A: refreshed from
-- chat on request). Not nfl-edge data: nothing in sim/, priors, or the web app reads this schema.
-- status_at_pull is ESPN's injury status at download time, NOT the player's game-day status.

create table if not exists fantasy.loc_league_settings (
  season int primary key,
  espn_league_id bigint not null,
  league_name text not null,
  num_teams int not null,
  regular_season_weeks int not null,
  playoff_teams int not null,
  scoring_type text not null,
  tie_rule text,
  faab_budget int not null,
  faab_min_bid int not null,
  acquisition_limit int not null,          -- -1 = unlimited
  waiver_process_days text[] not null,
  waiver_process_hour int not null,
  trade_deadline timestamp not null,
  veto_votes_required int,
  roster_slots jsonb not null,
  as_of timestamptz not null default now()
);

create table if not exists fantasy.loc_scoring_rules (
  season int not null,
  abbr text not null,
  stat text not null,
  points numeric(5,2) not null,
  primary key (season, abbr)
);

create table if not exists fantasy.loc_teams (
  season int not null,
  espn_team_id int not null,
  team text not null,                      -- ESPN name, trailing spaces removed
  abbrev text not null,
  owner text not null,
  faab_spent int not null,
  faab_remaining int not null,
  acquisitions int not null,
  drops int not null,
  trades int not null,
  as_of timestamptz not null default now(),
  primary key (season, espn_team_id),
  unique (season, team)
);

alter table fantasy.loc_weekly_scores
  add column if not exists espn_team_id int,
  add column if not exists opp_espn_team_id int;

create table if not exists fantasy.loc_player_week_scores (
  season int not null,
  week int not null,
  espn_team_id int not null,
  player text not null,
  position text,
  nfl_team text,
  opponent text,
  slot text not null,                      -- ESPN slot; BE = bench, RB/WR/TE = FLEX
  proj_pts numeric(6,2),
  actual_pts numeric(6,2),
  status_at_pull text,
  pulled_at timestamptz not null default now(),
  primary key (season, week, espn_team_id, player)
);

create table if not exists fantasy.loc_transactions (
  id bigint generated always as identity primary key,
  season int not null,
  week int,
  espn_ts timestamp,                       -- ESPN timestamp; null for trades from the activity feed
  espn_team_id int not null,
  txn_type text not null,                  -- FREEAGENT, WAIVER, TRADE, DRAFT
  status text not null,                    -- EXECUTED, PENDING, CANCELED, FAILED_*
  bid int,
  item_type text not null,                 -- ADD, DROP, TRADE_SENT, TRADE_RECEIVED, DRAFTED
  player text not null,
  group_key text not null,                 -- ties the items of one transaction together
  note text
);
create index if not exists loc_transactions_team_idx
  on fantasy.loc_transactions (season, espn_team_id, week);

create table if not exists fantasy.loc_rosters (
  season int not null,
  week int not null,
  espn_team_id int not null,
  player text not null,
  position text,
  nfl_team text,
  slot text not null,
  status_at_pull text,
  season_pts numeric(7,2),
  season_proj numeric(7,2),
  pulled_at timestamptz not null default now(),
  primary key (season, week, espn_team_id, player)
);

create or replace view fantasy.loc_standings as
with s as (
  select w.season, w.week, w.team, w.actual_pts, w.proj_pts, w.is_final,
         o.actual_pts as opp_pts,
         (select count(*) from fantasy.loc_weekly_scores x
           where x.season = w.season and x.week = w.week and x.team <> w.team
             and x.actual_pts < w.actual_pts) as allplay_w,
         (select count(*) from fantasy.loc_weekly_scores x
           where x.season = w.season and x.week = w.week and x.team <> w.team
             and x.actual_pts > w.actual_pts) as allplay_l
  from fantasy.loc_weekly_scores w
  join fantasy.loc_weekly_scores o
    on o.season = w.season and o.week = w.week and o.team = w.opp_team
)
select season, team,
       count(*) filter (where actual_pts > opp_pts) as wins,
       count(*) filter (where actual_pts < opp_pts) as losses,
       count(*) filter (where actual_pts = opp_pts) as ties,
       sum(actual_pts) as pf,
       sum(opp_pts) as pa,
       sum(proj_pts) as proj_pf,
       sum(actual_pts) - sum(proj_pts) as plus_minus,
       sum(allplay_w) as allplay_wins,
       sum(allplay_l) as allplay_losses,
       max(sum(actual_pts)) over (partition by season) - sum(actual_pts) as pts_back_of_pf_leader,
       bool_and(is_final) as all_final
from s
group by season, team;
