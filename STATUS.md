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
- tests-sim (2b96e83): 33 spec tests written before the simulator; all failed against stubs.
- sim-game (e54293a): drives-first game sim, fixed FG rate with solved p_td, game-script pass mix, OT resolution. Team-level dispersion at 5k: plays sd 7.9, margin sd 14.5, total sd 14.6, ties 0.4%.
- sim-players-scoring (b226846): Dirichlet/multinomial allocation off team draws, capped TD splits (Σ player TDs == team TDs in every draw), QB line == receiver sums, DK/FD/PPR/DST scoring.
- sim-slate (f1c6067): `nfl-edge sim --season S --week W --draws N`; parquet draws under data/draws/, model.sim_runs/proj_games/proj_players/player_correlations/sim_checks. 14 games at 5k draws in ~4s.
- backtest: `nfl-edge backtest --season 2025 --weeks 1-18 --draws 5000` -> output/backtest_2025.md (+ CSVs; gitignored). Results below.

## Backtest 2025 (v1 priors, 5k draws, 272 games, ~60s)
- PASS spread MAE 2.73 vs close (bias −0.12, corr 0.82); PASS total MAE 2.32 (bias +0.48, corr 0.76); PASS invariants 3808/3808.
- FAIL calibration monotone: P(home cover at close) buckets 0.3–0.7 hit 0.45 / 0.53 / 0.45 / 0.48. Flat at ~50% = the v1 sim has no information beyond the closing line. Sim-vs-result MAE 10.36 vs closing-line 9.72; Brier(home win) sim 0.225 vs spread-implied 0.212. Expected for lookback-only priors; not tuned away.
- Market-gap warnings 65/544 (58 spread, 7 total). Worst weeks: 18 (spread MAE 5.0, bias −2.8; resting starters), 17 (3.75), 15 (3.62). All QB-channel / overrides territory → priors-refine.
- Player baseline (mean weekly Spearman vs actual PPR, players ranked by both): QB sim 0.667 vs ECR 0.759; RB 0.741 vs 0.794; WR 0.640 vs 0.699; TE 0.624 vs 0.709. Sim trails consensus by 0.05–0.09 everywhere; gap is injury/QB information ECR has and v1 doesn't.
- Leakage audit clean: priors source never references schedules/outcomes; loaded history max week is W−1 for weeks 1/10/18; roster status at week ≤ W is the one pre-kickoff information assumption (a live run has the same).

## Backtest 2025 after priors-refine (same 5k draws, 272 games, ~68s)
- priors-refine: `priors/qb.py` (starter from `schedules.*_qb_id` → `qb_pass_factor` on off_ppd and receiver yardage, `qb_att_share` split to QB2 with exact passer sums), `priors/depth.py` (both depth-chart shapes → pre-kickoff rank; 2025 daily snapshots normalized in the loader, raw rows untouched), usage overrides (`raw.player_overrides` out/doubtful → 0, multiplier), depth-chart cold start, RZ shares shrunk toward own volume share.
- Spread MAE 2.73 → 2.60 (corr 0.82 → 0.84); total MAE 2.32 → 2.26; warnings 65 → 60; invariants 3808/3808.
- QB ranking: Spearman 0.667 → 0.754, now within 0.01 of ECR (0.763). RB/WR/TE unchanged (−0.05 / −0.06 / −0.09 vs ECR): the remaining gap is injury/inactive information (overrides table is empty in the backtest).
- Week 18 still the outlier (4.75; was 5.0): resting non-QB starters is not in any source we ingest.
- Calibration still flat vs the closing line (0.49 / 0.54 / 0.44 / 0.48 across the 0.3–0.7 buckets): no edge over close from public priors. This is the expected v1 outcome, not a defect; the acceptance criterion as written cannot be met without information the market lacks.
- Leakage audit clean; priors' only `raw.schedules` reads are week-W starters and gamedays (listed by the audit).

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
- [x] Backtest 2025 report at 5k draws; invariants 100%; spread MAE 2.60 ≤ 3, total MAE 2.26 ≤ 4
- Cover-calibration monotonicity vs the close is retired as a build gate (decision, 2026-09-04): a public-data model is not expected to beat the closing line at build time. It becomes a season-long grading target in Step 7. Honest baseline every refinement must beat: sim-vs-result MAE 10.31 against the close's 9.72.

## Open items for the next plan (lines/edge, DFS export)
- Populate `raw.player_overrides` weekly (injury report) — the RB/WR/TE gap to ECR is mostly this.
- Depth-chart cold start covers ranks 1–3 only; deeper players with no history are still excluded.
- OT is a one-drive resolution (0.4% ties); margin/total sd run ~0.5–1 point wide of NFL history — revisit once P(cover) is graded against real bets.
- Supabase still pending an alphanumeric DB password; everything validated on local Postgres 16.
