-- raw.fantasypros_snapshots gains a fourth endpoint: 'player_points' (FantasyPros weekly PPR points,
-- one row per player-week, payload {points, scoring}). The primary key
-- (endpoint, season, week, fetched_at, fp_id) already fits it; only the endpoint check widens.
-- Rows stay append-only keyed by fetched_at. Nothing in sim/ or priors/ reads this table.

alter table raw.fantasypros_snapshots drop constraint if exists fantasypros_snapshots_endpoint_check;
alter table raw.fantasypros_snapshots add constraint fantasypros_snapshots_endpoint_check
  check (endpoint in ('projections', 'rankings', 'injuries', 'player_points'));
