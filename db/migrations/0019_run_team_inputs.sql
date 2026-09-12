-- Per-team inputs the sim already computed. PK (run_id, team). Written from slate.run
-- immediately after sim_runs. Old runs stay empty until the next sim.

create table if not exists model.run_team_inputs (
  run_id uuid not null references model.sim_runs(run_id) on delete cascade,
  team text not null,
  off_ppd_raw numeric,
  off_ppd_adj numeric,
  def_ppd_allowed numeric,
  drives_mean numeric,
  plays_per_drive numeric,
  neutral_pass_rate numeric,
  qb_starter_id text,
  qb_lookback_id text,
  qb_lookback_att numeric,
  qb_starter_att numeric,
  qb_pass_factor numeric,
  league_off_ppd numeric,
  league_def_ppd_allowed numeric,
  primary key (run_id, team)
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on model.run_team_inputs to web_reader;
  end if;
end
$$;
