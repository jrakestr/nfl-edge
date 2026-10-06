-- League of Champions injury status history. Every ESPN pull inserts a fresh set of rows stamped
-- with pulled_at; nothing is ever updated or deleted, so a player's status at each point in time
-- survives (loc_player_week_scores.status_at_pull and loc_rosters.status_at_pull are replaced on every
-- run and only ever hold the latest pull). The trigger enforces it for the ingest and any stray query.
-- Covers every rostered player (starters, bench, IR), so "healthy" is recorded as well as "Q".
-- Not nfl-edge data: nothing in sim/ or priors/ reads this schema.

create table if not exists fantasy.loc_status_snapshots (
  season int not null,
  week int not null,                       -- ESPN's current week at pull time
  espn_team_id int not null,
  player text not null,
  pulled_at timestamptz not null,
  position text,
  nfl_team text,                           -- ESPN code (LAR, WSH); raw.schedules uses LA, WAS
  slot text not null,                      -- ESPN lineup slot at pull time; BE = bench
  status text,                             -- ESPN injuryStatus: ACTIVE, QUESTIONABLE, OUT, ...
  primary key (season, week, espn_team_id, player, pulled_at)
);
create index if not exists loc_status_snapshots_pulled_idx
  on fantasy.loc_status_snapshots (season, week, pulled_at);

create or replace function fantasy.loc_status_snapshots_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'fantasy.loc_status_snapshots is append-only (% not allowed)', tg_op;
end
$$;

drop trigger if exists loc_status_snapshots_no_change on fantasy.loc_status_snapshots;
create trigger loc_status_snapshots_no_change
  before update or delete on fantasy.loc_status_snapshots
  for each row execute function fantasy.loc_status_snapshots_append_only();

drop trigger if exists loc_status_snapshots_no_truncate on fantasy.loc_status_snapshots;
create trigger loc_status_snapshots_no_truncate
  before truncate on fantasy.loc_status_snapshots
  for each statement execute function fantasy.loc_status_snapshots_append_only();

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on fantasy.loc_status_snapshots to web_reader;
  end if;
end
$$;
