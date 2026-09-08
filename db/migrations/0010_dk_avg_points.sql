-- DK export AvgPointsPerGame, used as Typical-game fallback when a player has no prior-season stats.
alter table raw.dk_salaries add column if not exists avg_points double precision;
