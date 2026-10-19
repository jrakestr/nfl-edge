-- Pre-slate rates saved with the run so the lineup drawer survives draw-parquet pruning.
-- dk_p10 / dk_p90: DK points quantiles. boom_rate: share of draws >= 3x salary/1000.
-- bust_rate: share of draws < 1x salary/1000. Boom and bust are null when no salary was loaded.
alter table model.proj_players add column if not exists dk_p10 numeric;
alter table model.proj_players add column if not exists dk_p90 numeric;
alter table model.proj_players add column if not exists boom_rate numeric;
alter table model.proj_players add column if not exists bust_rate numeric;

-- Simulated GPP Top 1% attribution from the NFL-DFS-Tools exposure file (not the contest rate).
alter table model.dfs_exposure add column if not exists top1_pct numeric;
