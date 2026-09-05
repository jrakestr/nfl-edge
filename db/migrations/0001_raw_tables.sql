-- Raw tables mirror nflverse releases. Keyed by season/week so ingest is idempotent (upsert).

create schema if not exists raw;

create table if not exists raw.schedules (
  game_id text primary key,
  season int not null,
  game_type text,
  week int not null,
  gameday date,
  weekday text,
  gametime text,
  away_team text not null,
  home_team text not null,
  away_score int,
  home_score int,
  result int,
  total int,
  overtime int,
  away_rest int,
  home_rest int,
  away_moneyline int,
  home_moneyline int,
  spread_line numeric,
  away_spread_odds int,
  home_spread_odds int,
  total_line numeric,
  under_odds int,
  over_odds int,
  div_game int,
  roof text,
  surface text,
  temp int,
  wind int,
  away_qb_id text,
  home_qb_id text,
  away_qb_name text,
  home_qb_name text,
  stadium text,
  ingested_at timestamptz default now()
);

-- Every ingest snapshots the schedule's market fields here so line movement is preserved.
create table if not exists raw.market_lines (
  id bigserial primary key,
  game_id text not null references raw.schedules(game_id),
  captured_at timestamptz not null default now(),
  source text not null default 'nflverse',
  spread_line numeric,
  total_line numeric,
  away_moneyline int,
  home_moneyline int,
  away_spread_odds int,
  home_spread_odds int,
  over_odds int,
  under_odds int
);
create index if not exists market_lines_game_idx on raw.market_lines(game_id, captured_at);

create table if not exists raw.player_stats_weekly (
  season int not null,
  week int not null,
  player_id text not null,
  player_name text,
  position text,
  team text,
  opponent_team text,
  stats jsonb not null,
  ingested_at timestamptz default now(),
  primary key (season, week, player_id)
);

create table if not exists raw.team_stats_weekly (
  season int not null,
  week int not null,
  team text not null,
  opponent_team text,
  stats jsonb not null,
  ingested_at timestamptz default now(),
  primary key (season, week, team)
);

create table if not exists raw.ff_opportunity_weekly (
  season int not null,
  week int not null,
  player_id text not null,
  full_name text,
  position text,
  posteam text,
  stats jsonb not null,
  ingested_at timestamptz default now(),
  primary key (season, week, player_id)
);

create table if not exists raw.ff_rankings_weekly (
  captured_at timestamptz not null default now(),
  fp_page text,
  player text,
  pos text,
  team text,
  ecr numeric,
  best int,
  worst int,
  sd numeric,
  raw jsonb,
  primary key (captured_at, fp_page, player, pos)
);

create table if not exists raw.depth_charts (
  season int not null,
  week int,
  club_code text not null,
  gsis_id text,
  position text,
  depth_position text,
  depth_team int,
  full_name text,
  dt timestamptz,
  ingested_at timestamptz default now()
);
create index if not exists depth_charts_idx on raw.depth_charts(season, week, club_code);

create table if not exists raw.snap_counts (
  season int not null,
  week int not null,
  pfr_player_id text not null,
  player text,
  position text,
  team text,
  opponent text,
  offense_snaps int,
  offense_pct numeric,
  defense_snaps int,
  defense_pct numeric,
  st_snaps int,
  st_pct numeric,
  primary key (season, week, pfr_player_id)
);

create table if not exists raw.rosters_weekly (
  season int not null,
  week int not null,
  team text not null,
  gsis_id text not null,
  full_name text,
  position text,
  depth_chart_position text,
  status text,
  primary key (season, week, gsis_id)
);

create table if not exists raw.dk_salaries (
  site text not null,
  slate_id text not null,
  slate_type text not null,        -- classic | showdown
  player_dk_id text not null,
  name text not null,
  position text,
  roster_position text,
  team text,
  salary int,
  game_info text,
  ingested_at timestamptz default now(),
  primary key (site, slate_id, player_dk_id, roster_position)
);

-- Manual player overrides (injuries, usage bumps) since nflverse injuries ended after 2024.
create table if not exists raw.player_overrides (
  season int not null,
  week int not null,
  player_id text not null,
  status text,                     -- out | doubtful | questionable | active
  usage_multiplier numeric default 1.0,
  note text,
  updated_at timestamptz default now(),
  primary key (season, week, player_id)
);
