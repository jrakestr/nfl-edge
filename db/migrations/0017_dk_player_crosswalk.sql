-- Permanent DraftKings id → gsis (or {team}_DST). nflverse ff_playerids has no
-- DraftKings column, so rows are matched once and reused. Manual rows
-- (automatic = false) are never overwritten by ingest.

create table if not exists raw.dk_player_crosswalk (
  player_dk_id text primary key,
  gsis_id text not null,
  source text not null,
  automatic boolean not null default true,
  updated_at timestamptz not null default now()
);
