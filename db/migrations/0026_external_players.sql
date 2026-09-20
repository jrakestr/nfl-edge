-- Player-level third-party benchmarks (NFLGameSim). Benchmark only: nothing in
-- sim/ reads this table. player_id is null when the name does not uniquely match
-- raw.players; those rows are kept and reported, never dropped.

create table if not exists raw.external_players (
  source text not null,
  season int not null,
  week int not null,
  player_id text,
  name text not null,
  team text not null,
  opponent text,
  game_id text,
  pass_yds numeric,
  pass_td numeric,
  pass_int numeric,
  rush_yds numeric,
  rush_td numeric,
  rec_yds numeric,
  rec_td numeric,
  fpts_dk numeric,
  ingested_at timestamptz default now(),
  primary key (source, season, week, name, team)
);

create index if not exists external_players_lookup_idx
  on raw.external_players (source, season, week, player_id);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on raw.external_players to web_reader;
  end if;
end
$$;
