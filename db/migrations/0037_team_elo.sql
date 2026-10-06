-- Margin Elo. team_elo is the rating after that week's graded games.
-- elo_updates is one row per game. Week W reads the latest row with week < W.

create table if not exists model.team_elo (
  team text not null,
  season int not null,
  week int not null,
  rating double precision not null,
  primary key (team, season, week)
);

create table if not exists model.elo_updates (
  game_id text primary key,
  run_id uuid not null,
  season int not null,
  week int not null,
  home_team text not null,
  away_team text not null,
  actual_margin double precision not null,
  expected_margin double precision not null,
  k double precision not null,
  rating_home_before double precision not null,
  rating_away_before double precision not null
);

alter table model.run_team_inputs add column if not exists elo_rating numeric;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.team_elo to web_reader;
    grant select on model.elo_updates to web_reader;
  end if;
end
$$;
