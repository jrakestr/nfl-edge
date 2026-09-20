## User story

As a person entering one DraftKings lineup, I want the 150 sim lineups screened and ranked for cash or a single-entry tournament so I can export one file DraftKings will accept, with RTS shown beside our number when that file is loaded and never mixed into our projection.

## Acceptance criteria

### Scenario 1: Cash pick hides GPP stats and ranks by floor

* **Given** a slate of `model.dfs_lineups` with per-player `stat_summary` p10 values
* **When** I choose Cash on `/week/[n]/dfs/[site]/[slate]`
* **Then** lineups rank by summed p10 (tie-break our projection), Win % and ROI are hidden, and the pick exports as a one-row DK CSV whose line 1 is the site header and whose filename is `dk_upload_<slate_id>_<run8>_single.csv`

### Scenario 2: Tournament pick requires a QB stack near the ceiling

* **Given** the same 150 and a slate-best projection
* **When** I choose Tournament
* **Then** only lineups within 4.0 of the best projection and with a QB plus at least one same-team WR/TE (stack column present) remain, they rank by simulated ROI, and field ownership is the sum of `own_field_sim`

### Scenario 3: Screens, RTS, and the CLI

* **Given** current overrides (out, doubtful, or usage below 0.5), leftover salary over 1,500, or a repeated `player_id`
* **When** a lineup hits any of those, or `nfl-edge benchmark rts` has loaded `data/benchmarks/rts_projections_<season>_week<WW>.csv` into `raw.external_players` with `source='rts'`
* **Then** each removal shows a plain-language reason; RTS re-score appears next to ours without blending; a player more than 4 points above RTS is flagged; default sort prefers the top 10 on both scorings; missing RTS is an em dash

## Steps

1. `pick-one-rank`: Pure TypeScript rank/screen/RTS helpers and `source=single` on the upload filename. Tests first.
2. `rts-external`: CLI `nfl-edge benchmark rts` writes RTS projected points into `raw.external_players`. Tests first. Nothing in sim/ reads this table.
3. `pick-one-web`: LineupReview Pick one panel, page queries, one-row export. Tokens only, no snake_case, nothing under 14px. `npm run lint && typecheck && test && build`.
