-- Step 7: grade every edge/verdict against results and the last pre-kickoff snapshot.
-- model.results is empty (checked), so the re-key is a plain alter. mean_* on proj_games is
-- display-only; P(cover) still uses the median.

alter table model.results
  add column if not exists market_line_id bigint references raw.market_lines(id),
  add column if not exists line numeric,               -- the number bet (spread_line / total_line; 0 for ML)
  add column if not exists price int,                  -- American price on this side at the bet snapshot
  add column if not exists market_prob numeric,        -- de-vigged at the bet snapshot (copied from edges)
  add column if not exists edge numeric,
  add column if not exists kelly_fraction numeric,
  add column if not exists close_market_line_id bigint references raw.market_lines(id),  -- null when schedules fallback
  add column if not exists close_source text check (close_source in ('snapshot','schedules')),
  add column if not exists close_line numeric,
  add column if not exists close_price int,
  add column if not exists clv_points numeric,         -- signed toward our side; null for moneyline
  add column if not exists actual numeric,             -- margin for spread/ML, total for total
  add column if not exists pnl numeric,                -- units per 1u flat stake at `price`: win b, loss -1, push 0
  add column if not exists pnl_kelly numeric,          -- kelly_fraction * pnl
  add column if not exists is_last_snapshot boolean,   -- this snapshot is the game's last before kickoff (or only)
  add column if not exists verdict_pick boolean default false,  -- the verdict's Side/Total chip is this row
  add column if not exists verdict_call text;          -- 'pays' | 'does not pay' | 'coin flip' on the market-side spread row only
alter table model.results drop constraint if exists results_pkey;
delete from model.results;  -- empty today (checked); no rows to migrate
alter table model.results alter column market_line_id set not null;
alter table model.results add primary key (run_id, market_line_id, market_type, side);
create index if not exists results_run_game_idx on model.results (run_id, ref_id);

alter table model.proj_games
  add column if not exists mean_spread numeric,        -- mean(home - away); display only
  add column if not exists mean_total numeric;

create or replace view model.verdicts_latest as
select v.* from model.verdicts v
join raw.market_lines m on m.id = v.market_line_id
where m.captured_at = (select max(captured_at) from raw.market_lines where game_id = m.game_id);
