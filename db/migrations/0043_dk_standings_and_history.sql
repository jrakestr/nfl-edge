-- DraftKings contest results: my entry history, per-contest standings, per-contest player
-- ownership/points, and the slot breakdown of my own entries. Natural keys are DK ids.
-- Replacing a contest = delete its raw.dk_contests row (cascades) then reload it in one transaction.
-- web_reader select is covered by the default privileges from 0006.

create table if not exists raw.dk_entry_history (
  entry_key       bigint primary key,
  sport           text not null,
  game_type       text not null,
  entry_name      text not null,
  contest_key     bigint not null,
  contest_time    timestamptz,
  place           int,
  points          numeric,
  winnings_cash   numeric(12,2) not null default 0,
  winnings_ticket numeric(12,2) not null default 0,
  contest_entries int,
  entry_fee       numeric(10,2),
  prize_pool      numeric(14,2),
  places_paid     int,
  ingested_at     timestamptz not null default now()
);
create index if not exists dk_entry_history_contest_idx on raw.dk_entry_history (contest_key);

comment on table raw.dk_entry_history is
  'DK contest-entry-history export, one row per entry. Result fields (place, points, winnings) live here, not in the standings file.';

create table if not exists raw.dk_contests (
  contest_key   bigint primary key,
  contest_name  text,
  entries       int not null,
  places_paid   int,
  top1_rank     int not null,
  top1_score    numeric not null,
  cash_score    numeric,
  slate_id      text,
  source_file   text not null,
  source_sha256 text not null,
  ingested_at   timestamptz not null default now()
);
create index if not exists dk_contests_slate_id_idx on raw.dk_contests (slate_id);

comment on column raw.dk_contests.top1_score is 'Points of the entry at rank floor(entries/100); the 99th-percentile line.';
comment on column raw.dk_contests.cash_score is 'Points on the last standings rank inside places_paid. Null when no history row gives places_paid.';
comment on column raw.dk_contests.slate_id is 'Smallest model slate (raw.dk_salaries.slate_id) whose salary names cover the contest players. Slate identity is the player set; contest FPTS are real-game points and agree across slates. Null when none covers.';

-- One row per (player, roster slot): DK lists a player once per slot he was drafted into
-- (Puka Nacua appears as WR and again as FLEX). Total ownership is the sum over slots.
create table if not exists raw.dk_contest_players (
  contest_key     bigint not null references raw.dk_contests(contest_key) on delete cascade,
  player_name     text not null,
  roster_position text not null,
  pct_drafted     numeric(8,6) not null,
  fpts            numeric(6,2),
  top1_rate       numeric(8,6),
  primary key (contest_key, player_name, roster_position)
);

comment on column raw.dk_contest_players.pct_drafted is 'Fraction of the field that rostered the player in this slot (35.11% = 0.3511).';
comment on column raw.dk_contest_players.top1_rate is 'Share of entries at or above the contest 99th-percentile score that rostered the player in this slot.';

create table if not exists raw.dk_contest_entries (
  contest_key bigint not null references raw.dk_contests(contest_key) on delete cascade,
  entry_id    bigint not null,
  rank        int not null,
  entry_name  text,
  points      numeric,
  lineup      text not null,
  primary key (contest_key, entry_id)
);
create index if not exists dk_contest_entries_rank_idx on raw.dk_contest_entries (contest_key, rank);

-- Only my entries (entry_id present in raw.dk_entry_history).
create table if not exists raw.dk_entry_slots (
  entry_key   bigint not null,
  slot_order  smallint not null,
  contest_key bigint not null references raw.dk_contests(contest_key) on delete cascade,
  slot        text not null,
  position    text,
  player_name text not null,
  fpts        numeric(6,2) not null,
  primary key (entry_key, slot_order)
);
create index if not exists dk_entry_slots_contest_idx on raw.dk_entry_slots (contest_key);

-- Per player over all slots.
create or replace view raw.dk_contest_player_totals as
select contest_key,
       player_name,
       sum(pct_drafted)                                           as own,
       max(fpts)                                                  as fpts,
       sum(top1_rate)                                             as top1_rate,
       min(roster_position) filter (where roster_position <> 'FLEX') as position
from raw.dk_contest_players
group by contest_key, player_name;

-- My entries keyed by the sorted set of their nine player names.
create or replace view raw.dk_entry_lineup_keys as
select entry_key,
       contest_key,
       string_agg(lower(btrim(player_name)), '|' order by lower(btrim(player_name))) as lineup_key
from raw.dk_entry_slots
group by entry_key, contest_key;

-- Mass lineups matched to my contest entries by the set of nine names.
create or replace view model.dfs_lineup_entries as
select l.id as lineup_pk,
       l.run_id,
       l.site,
       l.slate_id,
       l.lineup_id,
       k.entry_key,
       k.contest_key,
       e.rank,
       e.points,
       h.winnings_cash,
       h.entry_fee,
       h.places_paid,
       (h.place is not null and h.places_paid is not null and h.place <= h.places_paid) as cashed
from model.dfs_lineups l
cross join lateral (
  select string_agg(lower(btrim(p ->> 'name')), '|' order by lower(btrim(p ->> 'name'))) as lineup_key
  from jsonb_array_elements(l.lineup -> 'players') p
) lk
join raw.dk_entry_lineup_keys k on k.lineup_key = lk.lineup_key
join raw.dk_contest_entries e on e.contest_key = k.contest_key and e.entry_id = k.entry_key
left join raw.dk_entry_history h on h.entry_key = k.entry_key
where l.construction = 'mass';

grant select on all tables in schema model, raw to web_reader;
