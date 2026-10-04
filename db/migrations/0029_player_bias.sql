-- Bias cells from results/player_proj_actual.py, one row per (dimension, label), replaced each
-- grade. Python owns the gate; the web app reads these rows and does not recompute them.
-- Diagnostic only: nothing in sim/ or priors reads this table.

create table if not exists model.player_bias (
  season int not null,
  ord int not null,
  dimension text not null,
  label text not null,
  n int not null,
  projected double precision,
  actual double precision,
  mean_resid double precision,
  mean_pct double precision,
  mae double precision,
  se double precision,
  weeks_graded int not null,
  state text not null,
  reason text not null,
  owner text,
  computed_at timestamptz default now(),
  primary key (season, dimension, label)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.player_bias to web_reader;
  end if;
end
$$;
