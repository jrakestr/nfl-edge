-- Per-player projected vs actual DK, written at grade time from the kickoff-locked run.
-- Diagnostic only: nothing in sim/ or priors reads this table.
-- residual_dk = actual_dk - proj_dk_mean (positive means we underproject).
-- proj_dk_p50 and proj_pass_att come from draw parquet and are null once it is pruned.
-- actual_* are null when the player has no weekly row (did not play).

create table if not exists model.player_proj_actual (
  run_id uuid not null references model.sim_runs(run_id) on delete cascade,
  player_id text not null,
  season int not null,
  week int not null,
  game_id text,
  team text,
  position text,
  tier text not null,
  had_opportunity boolean not null,
  proj_dk_mean double precision,
  proj_dk_p50 double precision,
  actual_dk double precision,
  residual_dk double precision,
  proj_targets double precision,
  proj_carries double precision,
  proj_pass_att double precision,
  proj_pass_yds double precision,
  proj_rush_yds double precision,
  proj_rec_yds double precision,
  actual_targets double precision,
  actual_carries double precision,
  actual_pass_att double precision,
  actual_pass_yds double precision,
  actual_rush_yds double precision,
  actual_rec_yds double precision,
  graded_at timestamptz default now(),
  primary key (run_id, player_id)
);
create index if not exists player_proj_actual_week_idx
  on model.player_proj_actual (season, week, position);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.player_proj_actual to web_reader;
  end if;
end
$$;
