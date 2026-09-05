# Status

Plan: `~/.cursor/plans/nfl_edge_steps_1-3_*.plan.md` (Steps 1–3 of docs/architecture.md §8)

## Done
- Scaffold (d401be7): schedules ingest, migrations 0001–0002, configs, CLI shell
- docs/purpose.md, AGENTS.md, .cursor/rules
- env-migrate (7a5bd94): uv env, `nfl-edge db migrate|counts`, migration 0003, pytest `network` marker
- ingest-players (a7d7ada): raw.players crosswalk (24,832 players; 22,662 pfr, 4,720 fantasypros ids)
- ingest-stats (dc36d3a): player/team weekly stats (jsonb), pbp -> raw.team_game_agg; attempts/carries tie out exactly to nflverse team_stats on 2024
- ingest-opp-consensus-context (ea133c4): ffopportunity, FantasyPros weekly ECR backfill, depth charts (2024 and 2025 shapes), snap counts, rosters; COPY-based writes
- backfill (e5a8db0): `nfl-edge backfill 2020 2025` runs all modules in 41s; one market_lines snapshot per game (1693 = Σ games)
- priors-simple: team/usage/efficiency v1 (lookback + shrink only). Checkpoint B at 2025 wk10: league drives 10.83, plays/drive 5.71, PPD 2.135, FG/drive 0.158, neutral pass 0.588; team spread PPD 1.55–2.73; all four share types sum to 1.0 on every team; 32/32 teams have one QB1; 432 active players with history (61 QB / 110 RB / 163 WR / 98 TE). Players with no history are excluded until priors-refine adds a depth-chart cold start.

## Checkpoint A output (local Postgres 16, 2025-09-04)
Rows per season (2020 / 2021 / 2022 / 2023 / 2024 / 2025):
- schedules 269 / 285 / 284 / 285 / 285 / 285; market_lines 1693 total (one per game)
- team_game_agg + team_stats_weekly 538 / 570 / 568 / 570 / 570 / 570
- player_stats_weekly 17,581 / 18,947 / 18,809 / 18,621 / 18,961 / 19,400
- ff_opportunity_weekly 5,441 / 5,688 / 5,624 / 5,643 / 5,586 / 5,631
- ff_rankings_weekly 7,437 / 8,353 / 8,063 / 7,802 / 6,595 / 8,060 — weeks covered: 2020 wk1–16, 2021 wk1–17, 2022/2023/2025 wk2–17, 2024 wk4–17
- snap_counts ~25–27k per season; rosters_weekly ~44–47k; depth_charts ~37k (2020–2024), 554,215 daily-snapshot rows for 2025 (week null until priors-refine)
- players 24,832
- Crosswalk: snap_counts pfr ids unresolved via raw.players 0.05–0.32% per season; 0.00–0.12% of offensive snaps

## Blocked / needs a decision
- Supabase: Postgres rejects the password in .env (host reachable over IPv6). Reset the DB password to alphanumeric, update .env, then run `nfl-edge db migrate && nfl-edge backfill` (≈1 min locally; longer over the network). Everything above was validated against a local Postgres 16 container (`docker run --name nfl-edge-pg -p 5433:5432 postgres:16`).

## Checkpoints
- [x] A — backfill 2020–2025 loaded, `nfl-edge db counts` printed (local Postgres; Supabase pending credentials)
- [x] B — `nfl-edge priors --season 2025 --week 10` plausible (see above)
- [ ] Backtest 2025 report at 5k draws; invariants 100%; spread MAE ≤ 3, total MAE ≤ 4
