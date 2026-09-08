-- Fair lines from sim draws for every offensive player-stat. 0010 was dk_avg_points.
-- P(over) is from parquet; sentence is the no-market PropCallout. web_reader may insert
-- a manual market_props row from the board (SELECT-only lifted for this table only).

create table if not exists model.fair_props (
  run_id uuid not null references model.sim_runs(run_id) on delete cascade,
  player_id text not null,
  stat text not null,
  fair_line numeric not null,
  p_over numeric not null,
  p10 numeric,
  p25 numeric,
  p75 numeric,
  p90 numeric,
  mean numeric,
  sentence text,
  actual numeric,
  over_hit int,
  graded_at timestamptz,
  created_at timestamptz default now(),
  primary key (run_id, player_id, stat)
);
create index if not exists fair_props_run_stat_idx on model.fair_props (run_id, stat);
create index if not exists fair_props_player_idx on model.fair_props (run_id, player_id);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.fair_props to web_reader;
    grant insert on model.market_props to web_reader;
    grant usage, select on sequence model.market_props_id_seq to web_reader;
  end if;
end
$$;
