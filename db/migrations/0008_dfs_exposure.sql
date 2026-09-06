-- Optimizer output columns that 0002 did not have. 0007 only added raw.dk_salaries.player_id.

alter table model.dfs_lineups add column if not exists lineup_id text;
alter table model.dfs_lineups add column if not exists salary_used int;
alter table model.dfs_lineups add column if not exists stack text;

create table if not exists model.dfs_exposure (
  run_id uuid references model.sim_runs(run_id) on delete cascade,
  site text not null,
  slate_id text not null,
  player_id text not null,
  sim_own numeric,
  proj_own numeric,
  leverage numeric,
  win_pct numeric,
  roi numeric,
  primary key (run_id, site, slate_id, player_id)
);
