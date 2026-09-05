-- 0003: player ID crosswalk, pbp-derived team-game aggregates, sim check log,
--       backfillable weekly consensus, and deduped market line snapshots.

-- Player ID crosswalk. Every cross-source join (stats gsis <-> snap_counts pfr <-> FantasyPros)
-- goes through this table. Source: nflreadpy.load_players() merged with load_ff_playerids().
create table if not exists raw.players (
  gsis_id text primary key,
  display_name text,
  merge_name text,                 -- lowercase, punctuation-stripped, from ff_playerids
  first_name text,
  last_name text,
  position text,
  position_group text,
  latest_team text,
  status text,
  birth_date date,
  rookie_season int,
  last_season int,
  pfr_id text,
  espn_id text,
  nfl_id text,
  esb_id text,
  pff_id text,
  sportradar_id text,
  fantasypros_id text,
  fantasy_data_id text,
  sleeper_id text,
  yahoo_id text,
  dk_id text,                      -- filled later from salary exports
  fd_id text,
  ingested_at timestamptz default now()
);
create index if not exists players_pfr_idx on raw.players(pfr_id);
create index if not exists players_fp_idx on raw.players(fantasypros_id);
create index if not exists players_merge_name_idx on raw.players(merge_name);

-- Per team-game aggregates computed from play-by-play at ingest. pbp itself is not stored.
create table if not exists raw.team_game_agg (
  season int not null,
  week int not null,
  game_id text not null,
  team text not null,
  opponent text not null,
  home int not null,               -- 1 if team was home
  plays int,                       -- offensive plays (pass + rush + sack), no penalties/no-plays
  drives int,
  plays_per_drive numeric,
  pass_att int,
  rush_att int,
  sacks int,                       -- sacks taken by this offense
  dropbacks int,                   -- pass_att + sacks
  neutral_pass_rate numeric,       -- pass share when |score diff| <= 7 and not final 4 min
  pass_rate numeric,
  epa_per_play numeric,
  epa_per_dropback numeric,
  yds_per_att numeric,
  pass_yds int,
  rush_yds int,
  points int,
  td int,
  pass_td int,
  rush_td int,
  fg_made int,
  fg_att int,
  fg_per_drive numeric,
  interceptions int,               -- thrown by this offense
  fumbles_lost int,
  ingested_at timestamptz default now(),
  primary key (season, week, game_id, team)
);
create index if not exists team_game_agg_team_idx on raw.team_game_agg(team, season, week);

-- Consistency checks written by sim/slate.py for every run.
create table if not exists model.sim_checks (
  id bigserial primary key,
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  check_name text not null,
  game_id text,
  team text,
  value numeric,
  threshold numeric,
  passed boolean not null,
  severity text not null check (severity in ('invariant', 'warning')),
  detail text,
  created_at timestamptz default now()
);
create index if not exists sim_checks_run_idx on model.sim_checks(run_id, severity, passed);

-- Weekly consensus is backfillable from the db_fpecr archive (one Friday scrape per week),
-- so re-key on (season, week, page_type, fp_id). Drop the scaffold shape; nothing was loaded.
drop table if exists raw.ff_rankings_weekly;
create table raw.ff_rankings_weekly (
  season int not null,
  week int not null,
  scrape_date date not null,
  page_type text not null,         -- weekly-qb | weekly-rb | weekly-wr | weekly-te | weekly-k | weekly-dst | weekly-offense
  fp_id text not null,             -- FantasyPros player id
  player text,
  pos text,
  team text,
  ecr numeric,
  sd numeric,
  best numeric,
  worst numeric,
  ingested_at timestamptz default now(),
  primary key (season, week, page_type, fp_id)
);
create index if not exists ff_rankings_fp_idx on raw.ff_rankings_weekly(fp_id, season, week);

-- Market line snapshots must not duplicate when an unchanged line is re-ingested.
-- Historical backfills insert one row per game; the live season appends only when a value moves.
create unique index if not exists market_lines_dedupe_idx on raw.market_lines (
  game_id,
  coalesce(spread_line, -999),
  coalesce(total_line, -999),
  coalesce(away_moneyline, -99999),
  coalesce(home_moneyline, -99999),
  coalesce(away_spread_odds, -99999),
  coalesce(home_spread_odds, -99999),
  coalesce(over_odds, -99999),
  coalesce(under_odds, -99999)
);
