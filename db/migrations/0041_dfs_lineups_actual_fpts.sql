-- Graded DK total per lineup. Null until scores publish and when any slot has no actual.
alter table model.dfs_lineups add column if not exists actual_fpts numeric;

comment on column model.dfs_lineups.actual_fpts is
  'Actual DK points from nflverse weekly stats (DST from team stats). Null = ungraded or incomplete.';
