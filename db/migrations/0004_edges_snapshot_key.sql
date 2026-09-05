-- Step 4: edges keyed to the exact market snapshot they were computed against, plus the
-- persisted Edge-board verdict payload. model.edges is empty at this point, so the re-key is a
-- plain alter.

alter table model.edges
  add column if not exists market_line_id bigint references raw.market_lines(id),
  add column if not exists price int,            -- American price actually offered for this side
  add column if not exists p_push numeric,       -- model P(push) at this line
  add column if not exists hold numeric,         -- sum(implied) - 1 for the two-sided market
  add column if not exists created_at timestamptz default now();

alter table model.edges drop constraint if exists edges_pkey;
alter table model.edges alter column market_line_id set not null;
alter table model.edges add primary key (run_id, market_line_id, market_type, side);
create index if not exists edges_run_game_idx on model.edges (run_id, ref_id);

-- Newest snapshot per game: what the Edge board shows by default.
create or replace view model.edges_latest as
select e.*
from model.edges e
join raw.market_lines m on m.id = e.market_line_id
where m.captured_at = (
  select max(captured_at) from raw.market_lines where game_id = m.game_id
);

-- One verdict payload per game per snapshot. The UI reads this; it never regenerates the grammar.
create table if not exists model.verdicts (
  run_id uuid not null references model.sim_runs(run_id) on delete cascade,
  game_id text not null,
  market_line_id bigint not null references raw.market_lines(id),
  payload jsonb not null,          -- one game object from WeekVerdicts.to_dict()['games'][i]
  created_at timestamptz default now(),
  primary key (run_id, game_id, market_line_id)
);
