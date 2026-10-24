-- The plus/minus copy on the players table. One row per player per week.
-- delta is whole DraftKings points added to the sim number for display.
-- The sim projection is not changed. Nothing in sim/ or priors reads this table.

create table if not exists model.player_point_edits (
  season int not null,
  week int not null,
  player_id text not null,
  delta int not null,
  updated_at timestamptz not null default now(),
  primary key (season, week, player_id),
  constraint player_point_edits_delta_range check (delta between -100 and 100)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select, insert, update on model.player_point_edits to web_reader;
  end if;
end
$$;
