-- League of Champions waiver wire and free agents. One row per player ESPN currently lists as
-- available. Each pull replaces the season (the pool is "who can I add now", not a history).
-- Status history stays on fantasy.loc_status_snapshots, which is append-only.
-- availability is the pool-entry status (WAIVERS or FREEAGENT). waiver_at is UTC from
-- waiverProcessDate; a free agent has none.
-- Not an input to sim/ or priors/. The league pages join espn_player_id to raw.players.espn_id
-- and read a stored sim mean; they do not project here.

create table if not exists fantasy.loc_available (
  season int not null,
  week int not null,                       -- ESPN's current week at pull time
  espn_player_id int not null,
  player text not null,
  position text,
  nfl_team text,                           -- ESPN code (LAR, WSH); raw.schedules uses LA, WAS
  injury_status text,
  percent_owned numeric,
  on_bye boolean not null,
  availability text not null,              -- WAIVERS or FREEAGENT
  waiver_at timestamptz,                   -- UTC; null for a free agent
  pulled_at timestamptz not null,
  primary key (season, espn_player_id)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on fantasy.loc_available to web_reader;
  end if;
end
$$;
