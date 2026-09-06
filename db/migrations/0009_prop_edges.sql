-- Prop edges vs a manual market_props snapshot. 0008 was dfs_exposure.
-- P(over) is from parquet draws; sentence is PropCallout copy for the web (read-only).

create table if not exists model.prop_edges (
  run_id uuid not null references model.sim_runs(run_id) on delete cascade,
  market_prop_id bigint not null references model.market_props(id),
  player_id text not null,
  game_id text,
  stat text not null,
  line numeric not null,
  side text not null check (side in ('over', 'under')),
  model_prob numeric,          -- P(win | no push)
  p_over numeric,              -- P(stat > line); display
  p_push numeric,
  market_prob numeric,         -- de-vigged
  edge numeric,
  kelly_fraction numeric,
  price int,
  hold numeric,
  sentence text,
  lean text check (lean in ('over', 'under', 'flat')),
  actual numeric,
  outcome int,                 -- 1 win, 0 loss, null push / ungraded
  pnl numeric,
  graded_at timestamptz,
  created_at timestamptz default now(),
  primary key (run_id, market_prop_id, side)
);
create index if not exists prop_edges_run_player_idx on model.prop_edges (run_id, player_id, stat);
create index if not exists prop_edges_game_idx on model.prop_edges (run_id, game_id);
