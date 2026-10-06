-- FantasyPros v2 public API captures. Every pull inserts rows keyed by fetched_at and is never
-- overwritten, so a later backtest can read only what was visible before a run's cutoff.
-- Nothing in sim/ or priors/ reads these tables until promoted (see AGENTS.md).
-- player_id is null when fp_id does not map to raw.players.fantasypros_id or a unique name match;
-- those rows are kept and reported, never dropped.

create table if not exists raw.fantasypros_snapshots (
  endpoint text not null check (endpoint in ('projections', 'rankings', 'injuries')),
  season int not null,
  week int not null,
  fetched_at timestamptz not null,
  fp_id text not null,
  player_id text,
  name text,
  team text,
  position text,
  payload jsonb not null,
  primary key (endpoint, season, week, fetched_at, fp_id)
);

create index if not exists fantasypros_snapshots_player_idx
  on raw.fantasypros_snapshots (endpoint, season, week, player_id);

-- Latest projections land in raw.external_players (source='fantasypros'); add the stat columns
-- the API returns that the NFLGameSim/RTS shape lacks. fpts_dk stays null: the API has no DK scoring.
alter table raw.external_players add column if not exists pass_att numeric;
alter table raw.external_players add column if not exists pass_cmp numeric;
alter table raw.external_players add column if not exists rush_att numeric;
alter table raw.external_players add column if not exists rec numeric;
alter table raw.external_players add column if not exists fpts_std numeric;
alter table raw.external_players add column if not exists fpts_ppr numeric;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'web_reader') then
    grant select on raw.fantasypros_snapshots to web_reader;
  end if;
end
$$;
