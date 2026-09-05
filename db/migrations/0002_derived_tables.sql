-- Derived tables are keyed by run_id so any week can be re-simulated and compared.

create schema if not exists model;

create table if not exists model.sim_runs (
  run_id uuid primary key default gen_random_uuid(),
  season int not null,
  week int not null,
  created_at timestamptz default now(),
  config_hash text,
  git_sha text,
  draws_per_game int,
  note text
);

-- Per-game score distribution summary. Full draws live in Supabase Storage as parquet (path below).
create table if not exists model.proj_games (
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  game_id text not null,
  fair_spread numeric,          -- median(home - away)
  fair_total numeric,
  home_win_prob numeric,
  p_home_cover_market numeric,  -- at market spread captured for this run
  p_over_market numeric,
  market_spread numeric,
  market_total numeric,
  draws_path text,
  primary key (run_id, game_id)
);

create table if not exists model.proj_players (
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  player_id text not null,
  game_id text,
  team text,
  position text,
  stat_summary jsonb not null,  -- {pass_yds:{mean,sd,p10,p50,p90}, rec:{...}, ...}
  fpts_dk_mean numeric,
  fpts_dk_sd numeric,
  fpts_fd_mean numeric,
  fpts_fd_sd numeric,
  proj_own_pct numeric,
  draws_path text,
  primary key (run_id, player_id)
);

create table if not exists model.player_correlations (
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  player_id_a text not null,
  player_id_b text not null,
  corr_dk numeric,
  primary key (run_id, player_id_a, player_id_b)
);

create table if not exists model.market_props (
  id bigserial primary key,
  season int not null,
  week int not null,
  player_id text,
  player_name text not null,
  stat text not null,           -- pass_yds | rush_yds | rec_yds | rec | pass_td | anytime_td ...
  line numeric not null,
  over_odds int,
  under_odds int,
  source text default 'manual',
  captured_at timestamptz default now()
);

create table if not exists model.edges (
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  market_type text not null,    -- spread | total | moneyline | prop
  ref_id text not null,         -- game_id or market_props.id
  side text,
  model_prob numeric,
  market_prob numeric,          -- de-vigged
  edge numeric,
  kelly_fraction numeric,
  primary key (run_id, market_type, ref_id, side)
);

create table if not exists model.dfs_lineups (
  id bigserial primary key,
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  site text not null,
  slate_id text not null,
  slate_type text not null,
  lineup jsonb not null,
  proj_fpts numeric,
  sim_win_pct numeric,
  sim_roi numeric,
  created_at timestamptz default now()
);

create table if not exists model.results (
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  market_type text not null,
  ref_id text not null,
  side text,
  model_prob numeric,
  closing_prob numeric,         -- for CLV
  outcome int,                  -- 1 win, 0 loss, null push
  clv numeric,
  graded_at timestamptz default now(),
  primary key (run_id, market_type, ref_id, side)
);
