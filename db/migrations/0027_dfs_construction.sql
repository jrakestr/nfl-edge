alter table model.dfs_lineups
  add column if not exists construction text not null default 'mass';

comment on column model.dfs_lineups.construction is
  'cash | single | mass — sets never share a delete key';
