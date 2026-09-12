-- Half-point P(cover)/P(over) histograms for the live Edge board. Written at sim time
-- and backfilled from parquet by `nfl-edge lines` so the current run does not need a re-sim.

alter table model.proj_games add column if not exists line_grid jsonb;
