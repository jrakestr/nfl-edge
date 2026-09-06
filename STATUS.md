# Status

Plans: `~/.cursor/plans/nfl_edge_steps_1-3_*.plan.md` (Steps 1–3, done); `~/.cursor/plans/nfl_edge_step_4_lines_edge.plan.md` (Step 4, lines and edge; this section)

## Step 4 — game lines and edge (2026-09-04)
- migration-edges (26932ce): 0004 re-keys `model.edges` to `(run_id, market_line_id, market_type, side)` + `price`, `p_push`, `hold`; view `model.edges_latest`; `model.verdicts (run_id, game_id, market_line_id, payload jsonb)`.
- tests-edge (a96e5d7): 44 spec tests for odds/de-vig/Kelly/snapshot edges and the verdict grammar, written first, all failing against stubs.
- market-edge (4a548e2): `market/edge.py` — reads `{game_id}.game.parquet` once per game, six rows per market snapshot, `model_prob` = P(win | no push), two-way de-vig, quarter Kelly at the offered price (null odds → −110), `insert_ignore`; parity vs `proj_games.p_home_cover_market` (push = half) 14/14 on 2025 wk10, 16/16 on 2026 wk1. Edge config block in `sim.yaml` (this changes `config_hash` for runs after this commit).
- outputs-lines (b7c9544) + cli-lines (811d3f4): `outputs/lines.py` pure verdict generator (three sentences, Side/Total/Home-wins chips, week summary, invariant-failed game withheld), `config/teams.yaml` (shared-city teams read "the Jets/Giants/Rams/Chargers"), `outputs/lines_io.py` + `nfl-edge lines --season --week [--run] [--json] [--min-edge] [--recompute]`; one `model.verdicts` row per game at the latest snapshot, same idempotency as edges.
- ingest-prekickoff (4873521): seasons ahead of nflverse's date guard load what exists (stats/opportunity/snap_counts skipped with a message; rosters from the preseason roster file); `ingest --lines-only` without `--week` snapshots the whole season and adds missing schedule rows; the live ECR feed (`load_ff_rankings("week")`: `page`, `fantasypros_id`, `player_name`) is normalized to the archive shape — it had never been exercised and would have crashed on the first live Tuesday. `qb.load_starters` keeps string dtypes when no starters are announced (empty result → Null dtype → concat error; found on the first 2026 build). Roster-team review passed: Walker SEA→KC, Etienne JAX→NO, Dowdle CAR→PIT, W. Robinson NYG→TEN all sit on their 2026 team with history keyed by `player_id`; every team's target/carry shares sum to 1.000; 32/32 teams have one QB1 from the depth-chart fallback (schedules has no announced Week 1 starters yet).
- lines-cron-doc (ee532de): `docs/ops.md` — snapshot cadence (documented, not created), weekly order, provenance; README points to it.
- test-e2e-lines (7a0b88b): `tests/test_lines_e2e.py` under a `db` marker (excluded by default; `pytest -m db`).

### Checkpoint C — Week 1 (Supabase; first run on local Postgres, see below)
- Supabase run `5823f735-0431-4faf-b175-edb980…` (git `29386d8`, 20k draws): `nfl-edge lines --season 2026 --week 1` prints the week summary and 16 verdicts; `model.verdicts` = 16 rows, `model.edges` = 96 (16 snapshots × 6), parity 16/16, invariants 224/224, warnings 5/32 — the same five games and the same summary sentence as the local run below.
- Local Postgres run `3d4fe1c7-0c26-4d10-86ce-ef29ff02f0dc` (`nfl-edge sim --season 2026 --week 1 --draws 20000`): 16 games, invariants 224/224, 7.7s. Warnings 5/32: spread gap > 4 on ARI@LAC (fair 6 / market 10.5), BAL@IND (3 / −3.5), DAL@NYG (2 / −2.5), MIA@LV (−3 / 3.5); total gap on NYJ@TEN (46 / 38.5).
- `nfl-edge lines --season 2026 --week 1` prints the week summary and 16 verdicts; `select count(*) from model.verdicts where run_id = '3d4fe1c7-…'` = 16. Summary: "11 sides and 13 totals clear a 3% edge; the biggest is Over 38.5 (+19.0%)". Those counts are what a lookback-only model produces against opening lines with a 2.6-point MAE to the close; the backtest says they do not cash. Grade them in Step 7, do not bet them.
- Observed snapshot cadence: exactly 1 `raw.market_lines` row per 2026 game so far (nflverse opening numbers; two `--lines-only` pulls an hour apart were no-ops). Closing-line resolution is unknown until the cron runs through a game week — record it here before Step 7 leans on "closing line".
- Week 18 rester note: 14 teams' season QB1 threw < 10 passes in 2025 wk18 (BUF, KC, PHI, LAC, GB, IND, ATL, NYJ, TEN, LV, MIA, and injury-return cases CIN/SF/WAS). For those teams the Week 1 model-minus-market spread averages −0.6 points vs +0.5 for the other 18 (team perspective, n = 14/18); the largest single gaps are LV −6.5, LAC −4.5, BUF −3.5. Directional evidence that the 2025 wk18 rows drag resting teams' priors down, not proof (opening lines, one week). Added to priors-refine below.

### Supabase bring-up (supabase-bringup, 2026-09-04 late)
- Credential: the reset password authenticated once its `@` and `!` were percent-encoded in `.env` (the URL had two `@`). Rewritten in place; never printed. Run every command with `DATABASE_URL` unset in the shell — an exported local DSN silently overrides `.env`.
- `db migrate` applied 0001–0004 on an empty database; `backfill --start 2020 --end 2025` took 3m20s over the network (41s local). `db counts` diff vs local (`output/counts_local.txt` / `output/counts_supabase.txt`, gitignored): 62/62 raw table-season pairs identical, including `depth_charts` 2025 (554,215) and 2026 (496,713); `market_lines` 1,805 both sides.
- Two fixes surfaced by the remote, both in `db.py`/`cli.py`: `db counts` on a database with no tables raised (`concat empty list`) — now prints an empty table and says to migrate; and the first `sim` died at Supabase's 2-minute `statement_timeout` in `priors/depth.load_depth` because the bulk COPY left `raw.depth_charts` (1.24M rows) with no planner statistics. After `analyze` the same query runs in 1.6s; `_write` now analyzes a table after any write of ≥ 10,000 rows so a fresh backfill never depends on autovacuum timing.
- `ingest --season 2026 --week 1` then `ingest --season 2026 --lines-only`: 272 schedules, 112 opening snapshots, 2,945 preseason roster rows, 496,713 daily depth-chart rows, 682 live-ECR rows; stats/opportunity/snap_counts skipped with the season-guard message. Snapshot cadence on Supabase: still 1 per game.

### lines-refine (trailing todo; not started)
- `fair_spread`/`fair_total` are medians of integer scores, so verdicts read "by 6.0 points" — use the mean (or a mid-quantile interpolation) for display and keep the median for P(cover). Sentence 1 uses `fair_spread` only; sentence 2/3 already use the exact draw probabilities.
- Verdict for a game whose line moved after the sim: `lines` computes edges for the new snapshot but `proj_games.p_home_cover_market` still refers to the sim-time line; the parity check logs when no snapshot matches. Surface "line moved from X" in the payload.
- `model.verdicts` keeps one row per snapshot; the UI wants the latest — add a `verdicts_latest` view alongside `edges_latest`.
- Kelly is per-market and ignores correlation between a game's spread and moneyline; cap per-game exposure before any staking UI.

### priors-refine additions from this step
- Exclude or downweight prior-season Week 18 in `history_where`/`with_weights` (resting starters; wk18 MAE 4.75 in the backtest, and the Week 1 rester gap above).
- Announced starters: `schedules.*_qb_id` is empty pre-kickoff; the depth-chart fallback carried Week 1. Re-run `ingest` Wed/Sat so the QB channel picks up announced starters.

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
- Nothing blocked. Supabase is live and matches the local Postgres 16 container (`docker run --name nfl-edge-pg -p 5433:5432 postgres:16`) row for row; keep the local container for the `db`-marked e2e test, whose 2025 wk10 draws exist only locally.

## Checkpoints
- [ ] UI — Edge board live on a Vercel URL reading Week 1 from Supabase (architecture §8 step 4b; plan: web app)
- [x] A — backfill 2020–2025 loaded, `nfl-edge db counts` printed (local Postgres 2026-09-04; Supabase identical, same day)
- [x] B — `nfl-edge priors --season 2025 --week 10` plausible (see above)
- [x] Backtest 2025 report at 5k draws; invariants 100%; spread MAE 2.60 ≤ 3, total MAE 2.26 ≤ 4
- [x] C — `nfl-edge lines --season 2026 --week 1` prints 16 verdicts from a 20k run and `model.verdicts` holds 16 rows, on Supabase (run `5823f735`) and on local Postgres (run `3d4fe1c7`).
- Cover-calibration monotonicity vs the close is retired as a build gate (decision, 2026-09-04): a public-data model is not expected to beat the closing line at build time. It becomes a season-long grading target in Step 7. Honest baseline every refinement must beat: sim-vs-result MAE 10.31 against the close's 9.72.

## Open items for the next plan (lines/edge, DFS export)
- Populate `raw.player_overrides` weekly (injury report) — the RB/WR/TE gap to ECR is mostly this.
- Depth-chart cold start covers ranks 1–3 only; deeper players with no history are still excluded.
- OT is a one-drive resolution (0.4% ties); margin/total sd run ~0.5–1 point wide of NFL history — revisit once P(cover) is graded against real bets.
- Supabase `statement_timeout` is 2 minutes for the `postgres` role. Any future query over `raw.depth_charts` daily rows (1.24M and growing ~3k/day) should filter on `(season, week, club_code)` (the only index) or add an index on `(season, dt)` in the next migration.
