-- Resolve DK salary rows to gsis_id (or {team}_DST). Filled by ingest.dk_salaries.

alter table raw.dk_salaries add column if not exists player_id text;
