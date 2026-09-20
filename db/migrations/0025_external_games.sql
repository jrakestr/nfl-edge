-- Benchmark cache for third-party game sims (mygamesim weekly paste).
-- Live Supabase already has this table; create-if-not-exists so local Postgres matches.
-- PK (source, game_id); types mirror web/src/lib/database.types.ts raw.external_games.

create table if not exists raw.external_games (
  source text not null,
  game_id text not null,
  season int not null,
  week int not null,
  gameday date,
  gametime text,
  away_team text,
  home_team text,
  market_spread_home numeric,
  market_total numeric,
  market_ml_home int,
  market_ml_away int,
  market_p_home_novig numeric,
  sim_home_pts numeric,
  sim_away_pts numeric,
  sim_total numeric,
  sim_margin_home numeric,
  sim_p_home_win numeric,
  sim_pick_winner text,
  sim_ats_lean text,
  sim_total_lean text,
  edge_spread_home numeric,
  edge_total numeric,
  edge_ml_home numeric,
  status text,
  actual_home_pts numeric,
  actual_away_pts numeric,
  actual_margin_home numeric,
  actual_total numeric,
  actual_winner text,
  pick_winner_result text,
  margin_within_7 text,
  ats_result text,
  ingested_at timestamptz default now(),
  primary key (source, game_id)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on raw.external_games to web_reader;
  end if;
end
$$;
