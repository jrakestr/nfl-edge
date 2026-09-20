# Status

Plans: `~/.cursor/plans/nfl_edge_master_a0a368ca.plan.md` (master, in progress); earlier steps 1–4 and 7 are done (see below). Web v2 plan `nfl_edge_web_v2_b29c8aae.plan.md` through Checkpoint A. Gemini plan `gemini_three_phases_b63212b0.plan.md` — Phase 1 live on Gemini 3.x; Phases 2–3 wait on accept.

## RTS injuries + starter share (2026-09-20)

What changed: `nfl-edge rts-status --season 2026 --week 2 --file ~/Downloads/RTS-Projection-Template.csv` wrote 309 `out`/`doubtful` overrides (`rts 0 proj 2026-09-20T18:52:15Z`, RTS proj 0 + salary, RB/WR/TE only) onto 105 DK rows → 331 week-2 rows (309 rts + 22 dk kept where RTS > 0); 0 manual/claims rows touched (none existed), 30 unmatched reported (`output/rts_status_2026_2.txt`), 48 near-zero listed not zeroed. `src2_projections_2026_week02.csv` never arrived so `--second` (implemented + tested) did not run — Vidal stays 7.75. `qb.build` sets starter `qb_att_share = 1.0` unless an override dampens him (no backup OUT writes); `priors/__init__.py` threads overrides through. Re-sim `0179481e` (`rts-injuries`, 20k, 16/16) + `lines` (1632 edges / 16 verdicts / 4500 fair_props) + `props` (0 lines) + `dfs` 150 lineups × 6 live slates. Gap closed vs RTS: Taylor 14.88→16.02 (RTS 21.36, remains 5.34), Walker 12.40→14.27 (19.56, remains 5.29), Montgomery 9.90→10.41 (16.04, remains 5.63), Judkins 8.77→9.80 (14.63, remains 4.83), Dobbins 6.54→8.55 (12.25, remains 3.70). Lead backs new vs src2/RTS-file: Hampton 8.86 vs 13.4, Tuten 4.93 vs 11.8/9.5, Love 8.92 vs 12.0/11.45, JCM 6.90 vs 10.4/10.51, CMC 19.63 vs 20.4/19.47 (at RTS), Brissett 21.35 vs 15.3/15.8 (high 5.5), McBride 20.93 vs 14.8/15.93 (high 5.0). Starters +0.5–1.4 on the full share; backups now rush-only 2.3–4.6 (Fields 5.06). Metchie 6.98→7.56 (RTS 0.53) and Austin 6.08→6.40 (RTS 0.18) widened — allocation, not availability.

What was verified: `pytest` 414 passed / 2 xfailed (usage-vector gates untouched) / `ruff` clean; 4 commits (`rts-status`, `qb-full-share`, `report-status`; rerun is DB+parquet only). Star-zero matches checked against `raw.players` teams (A.J. Brown NE, Pacheco DET, Kirk SF, Pittman PIT, Marquise Brown PHI are real 2026 rosters). `newest-run` 0179481e 16 16 == `slate-count` 16; sim invariants all passed (5 spread-gap warnings only). DET_BUF keeps its kickoff-locked run for grading; no complete `sim_runs` dropped (prune skipped week 2 ungraded). Palmer (BUF 3.14) and Hunter (JAX 1.69) unmatched — reported, no alias added without OK.

What was deferred: `shrink_k_usage` untouched — the remaining ~4–6 pt lead-back gaps are the carry-share allocation issue, not this task. Two-source `questionable` dampening (Harvey/Knight/Vidal/Burks/James/Tolbert) waits on the src2 export; rerun `rts-status --second` then re-sim when it lands. QB2 rush share (the rest of backup fpts) is the same STATUS item. `test_two_passers_still_sum_to_receivers_every_draw` stays as the share<1 invariant.

## DK reference lines (2026-09-19)

What changed: DraftKings is the reference market line from `2026-09-20T00:00:00Z` (`model.line_reference` / `config/line_reference.yaml`). Games kicking off before that stay nflverse. `model.market_lines_latest` feeds edges, verdicts, the board, and `lines`. Odds-api `h2h,spreads,totals` runs on both `lines-only` (even-hour, 3 credits, ~36/day) and week-rebuild; `RecentDuplicate` is a no-op. Week-2 sat-final `bcf81a44` re-priced (96 edges / 16 verdicts).

What was verified: week-1 `4d5d8a29` stayed 96 / 16; dry re-grade kept the same `close_market_line_id` on all 16 graded games. `trackRecord` 19–28–1, ROI −0.177; `weekScoreboard` n=16 spread 6–9–1 total 8–8–0 MAE 12.50 / 12.66. All 15 open week-2 games show DK spread and total; DET_BUF stays nflverse. Latest DK vs latest nflverse numbers match on those 15; 0 sign changes, 0 threshold crosses. `pytest` 384 passed / `ruff` clean; web lint / typecheck / 435 tests / build green.

What was deferred: Sunday 08:40 `sun-inactives` still has to finish on this tree. No sim. SAT DFS `json5` crash unchanged.

## grade-web (2026-09-19)

What changed: batched `fair_props` / `prop_edges` writes (`update_from`). Finished 2026 week-1 grade (DAL@NYG, DEN@KC). `/grading` reads `model.results` (tiles from the pick set; table and calibration from last-snapshot predated rows).

What was verified: missing-finals named no games. 16 distinct `ref_id` per market_type. `close_market_line_id` unchanged on all 84 already-graded last-snapshot rows. `weekScoreboard` nGames 16; track 19–28–1 on 48 picks. Kickoff runs for the two late games still had parquet; three older runs skipped (`skipped_no_parquet`). `fair_props` 15309 rows in one statement (no hang). `pytest` persist tests + `ruff` on those files; web lint / typecheck / 416 tests / build green.

What was deferred: Brier sim vs close stays file-only (`output/grading_2026.md`) — do not reimplement in TypeScript (`season-refine`). `grade-checkpoint`. `dk_reference_lines` close picker not in the tree; week-1 grade used nflverse snapshots. No `week1-grade` commit (DB only).

## Odds API health check (2026-09-19)

What changed: one live pull `env -u DATABASE_URL uv run nfl-edge ingest odds-api --markets h2h --regions us` (1 credit, no `--force`). Wrote 234 rows / 11 books into `raw.market_lines` (`source='odds_api'`). Week-2 `odds_api` rows 100 → 265, games 13 → 16, books 9 → 11. New `fetched_at` 2026-09-20 02:08:50 UTC; new-pull `captured_at` 2026-09-20 02:05:02–02:08:40 UTC.

What was verified: **pass**. Offline `pytest tests/test_odds_api.py` 9/9. HTTP 200 (no 401/429/422). `remaining=19994`, `used=6` (cumulative header), no remaining-credits warning, `skipped=0`. At the new `fetched_at`: 165 week-2 rows, 15 games, 11 books. `2026_02_DET_BUF` has 0 rows at this stamp (Sep 13 rows still present, append-only). All 15 open week-2 games have 11 books, including `2026_02_MIA_SF`, `2026_02_SEA_ARI`, `2026_02_NYG_LA` (0 on Sep 13; not in `skipped:`, so the API simply did not offer them then). Newest run still `4d5d8a29` (`sun-inactives`, week 1): `edges_latest` 96, `verdicts_latest` 16. Board stays pinned to `source='nflverse'`.

What was deferred: full `env -u DATABASE_URL uv run nfl-edge ingest odds-api --markets h2h,spreads,totals --regions us` (3 credits = 3 markets × 1 region). Not run. No `TEAM_NAMES` or matching change. No commit.

## Schedules upsert + Tuesday grade (2026-09-13)

What changed: `schedule_writes` updates `away_score`/`home_score`/`result`/`total` (score sum)/`overtime` on existing rows; betting columns stay put. `nfl-edge lines` withholds a missing spread edge instead of raising. `edges_latest`/`verdicts_latest` pinned to `source='nflverse'`. `lines --close` pins each game to the last pre-kickoff nflverse snapshot and marks `backfilled`. `com.nfl-edge.week-grade` Tuesday 09:00 Phoenix (`ops/week-grade.sh`, `output/cron-grade.log`); no `RunAtLoad`.

What was verified (Supabase, `DATABASE_URL` unset):
- Ingest 2026 week 1: `inserted=0, updated=12, line_snapshots=0`. Finals 14/16. Still open: `DAL@NYG` (SNF), `DEN@KC` (MNF).
- `lines --close --run 4d5d8a29-…`: 7 new backfilled verdicts (`NE@SEA`, `SF@LA`, `BAL@IND`, `CHI@CAR`, `CLE@JAX`, `NO@DET`, `NYJ@TEN`). The other Sunday games already had a live row at that close snapshot (`insert_ignore`). `54ac9015` live verdicts unchanged (16 games, `backfilled=false`).
- Grade wrote `model.results` before hanging in per-row `fair_props` UPDATEs (killed; not this plan). Assignments: `bf9a11f4` → TNF + Melbourne (36+42 rows, `predated=true`); `4d5d8a29` → 12 Sunday finals (768 rows, `predated=true`); 2 unplayed skipped.
- CLV is **not** 0 on every non-ML row (564 non-ML, 42 at 0, 522 nonzero). Expected: grade walks every snapshot, not only the close. Even on the close id, probability CLV is not uniformly 0.

What was deferred: Saturday `json5` DFS crash; `prop_grade`/`grade_fair_props` one-`execute`-per-row over Supabase; Monday job; sim rebuild; CLV retune. Tuesday agent will refuse week 1 until both remaining finals land.

## Lookback Phase 1 (2026-09-12)

Local only. Did not publish over the live 2026 week-1 run. `python -m nfl_edge.results.lookback_report`.

What changed: history window is three prior seasons + current (`week <> 18` on every season < S). Recency is `w = 2 ** (-age_weeks / H)` with **H = 6**. Shrink `n_eff` is Kish `(Σw)² / Σw²` on the weights that enter the rate. Every `shrink_k` retuned on 2024+2025 OOS realized rates (not lines). `shrink_k_qb_att` / QB-factor scoring **excluded MIA, CLE, NYJ, CIN, LV, ATL, WAS, MIN**.

What was verified (local Postgres, 2020–2025 history):
- Weight mass at H=6 (2026 week 1 team-games): 2023 **1.369%**, 2024 10.917%, 2025 87.714%. S−3 < 2% — honest window is two seasons.
- 3-season incumbent: raw 51 vs Kish 21.78 at H=8 (λ 0.944 → 0.879); at live H=6 Kish 16.73 (λ 0.848).
- shrink_k old → new: usage 3→1, targets 40→30, carries 60→5, qb_att 150→400, team 4→8, qb_share 3→6.
- Lamb: 12 raw / share 0.236 → Kish 12.64 on 44 raw games / share 0.223.
- Watson: 0 att, fill-to-league 7.028 / 6.238, factor **1.127** → 387 att, 6.519 / 6.411, factor **1.017**. Zero 2025 att no longer fills to league once 2024 exists.
- 32-team factor (includes the eight): before min/med/max 0.960 / 1.016 / 1.137, starter-change factor>1 = 5/8; after 0.953 / 1.011 / 1.129, 10/12 (wider lookback changes who is “lookback QB”).
- pts_gap vs market implied team total: **+0.88** on `f049d136` (20k) → **+1.05** local 5k, not published. Local `raw.player_overrides` is empty and `schedules.location` is missing (Melbourne treated as home HFA).

What was deferred: league-replacement QB baseline; Dirichlet / usage-vector k sweep (xfails stay); live 2026 week-1 rebuild (after Tue 2026-09-15 grade); Phases 2–4; tuning H against YPA or lines.

## Surface sim diagnostics (2026-09-12)

Shipped (`405d6da` and the six todos before it). Drawer Why reads `model.run_team_inputs`; MIA is Willis 35 att vs Tua 384, factor 1.137. `WeekBoard` stays a server component (`/week/[n]` First Load JS 788,702 uncompressed; shared shell 505,052).

Uncommitted `web/src/components/board/WhyExplain.tsx` is Gemini-phase working tree, not the diagnostics ship. If `npm run lint` goes red there (`react-hooks/set-state-in-effect` on the drawer fetch), do not debug it as a board or checks-panel regression. Lint is green as of this writing (the `setBusy` effect is gone); typecheck / 301 tests / build are green on the committed diagnostics.

20:00 `ops/week-rebuild.sh` is Python CLI only. Uncommitted `web/` does not touch the job. Tonight's checks after the run: Penix `00-0039917` still `out`; newest-run `dfs_exposure` leverage two-sided (a few above the field, a long tail below — all-negative means stop).

## Gemini three phases (2026-09-12)

What changed: `model.llm_calls` / `model.usage_claims`; server-only Gemini REST client; per-phase models (`explain` → `gemini-3.5-flash-lite`; `claims` / `optimize-nl` → `gemini-3.8-flash`; no global `GEMINI_MODEL`, no `gemini-3.1-pro-preview`). Explain join over `run_team_inputs` + `proj_games` + market; `nfl-edge lines` insert-if-absent backfill; claims paste route (no URL fetch); optimizer phrase compiler. Nothing in `sim/game.py`, `sim/players.py`, or the ILP path. `GEMINI_API_KEY` copied into gitignored `web/.env.local` and Vercel as a sensitive server env on production / preview / development (never `NEXT_PUBLIC_`).

What was verified: `models.list` returned 50 models / 40 `generateContent` IDs; both `gemini-3.5-flash-lite` and `gemini-3.8-flash` are callable. AI Studio Rate Limit (`aistudio.google.com/rate-limit`, jrakestr@gmail.com Pro) shows **No Cloud Projects Available** — live RPM/RPD rows are not visible until a Cloud project is imported. Official docs still have no free-tier RPM/RPD table. Third-party / forum measurements (not this project's row): Flash-Lite ~15 RPM / 500 RPD; `gemini-3.8-flash` ~5 RPM / **20 RPD**. Phase 1 stays on Flash-Lite. Phase 2 should batch documents rather than one call per paste if that 20 RPD holds.

First drawer pass failed on substance (payload recitation, snake field names). Prompt/schema retuned: `{driver, evidence_strength, sentences}`, snake reject, numeral guard accepts rounded values and percents from payload ratios, `pts_gap` added per side. Cache requires the new shape so old recitations are not served. Live: MIA thin · Willis 14% vs Tua (35 vs 384), 6.4 above implied 18.75; IND strong · 5.9 above implied, 2.46 ppd vs league 2.15, Jones 384 is a full-season sample so the gap is the prior. Prompt pins one-decimal points / two-decimal ppd / whole percents; lookback baseline not "expected"; no "raw"; evidence describes, does not endorse. Cache hits on reopen.

What was deferred: Phase 2 / 3 live checkpoints. Import a Cloud project in AI Studio if you want the live quota table. Do not Promote claims. Do not Generate from a parsed phrase until you say to. If 3.8 Flash is 20 RPD on this key, stop and report cost rather than upgrade or silently switch models.

## Week rebuild (2026-09-12)

## Week rebuild (2026-09-12)

What changed: `ops/week-rebuild.sh` re-applies `data/overrides/${SEASON}_wk${WW}.csv` after both `dk-salaries` and before sim; newest-run now checks player-game coverage and the sim fails closed on a missing usage team.
What was verified: `tests/test_week_rebuild_plist.py` (3) plus prune / sim-lock / slate-partial / slate-parquet (17). launchd will run this file at 20:00, not HEAD-from-last-week.
What was deferred: the injury plan's one-shot `nfl-edge overrides` apply if DK ingest has not run yet — 20:00 will apply the CSV itself before sim.

## DFS exposure parse (2026-09-12)

What changed: `parse_exposure_csv` reads by position (classic 8-header/9-data contract); `model.dfs_exposure` is `own_ours` / `own_field_proj` / `own_field_sim`; leverage is ours minus realized field.
What was verified: `tests/test_dfs_wrappers.py` (15) and ruff; web lint/typecheck/test/build. `stackCorrelations` cutoff is `own_ours >= 0.07` (measured: old `sim_own>=0.2` CTE 26–39 on main; `own_ours>=0.2` is 13–15).
What was deferred: live-week `nfl-edge dfs` rebuild; NFL-DFS-Tools writer patch (name Salary/Fpts, emit Proj. Own%, then `len(header)==len(row)`). Leverage stays off the stack-suggestions plan. Pre-0018 rows keep shifted values in `own_ours`; the panel hides them when `own_field_sim` is null. After tonight's rebuild, leverage must be two-sided (a few well above the field, a long tail below). All-negative again means the parse is fine and something else is wrong — stop before those numbers inform a lineup.

## Optimizer stack suggestions (2026-09-12)

What changed: Optimize shows same-game partners ranked by `corr × fpts_dk_sd` when anyone is locked; Players gained ceiling and position ranks. Leverage stayed off.
What was verified: web lint, typecheck, test, build. Require in stack wrote the pair; five generated lineups all contained Allen + Moore; two locked QBs returned "2 quarterbacks selected; a classic lineup has room for 1".
What was deferred: Leverage column and sort until a `dfs` persist writes the three named own columns.

## Week 1 live (2026-09-12)

TNF + Melbourne graded against kickoff-locked run `bf9a11f4` (`predated_kickoff`). Board hides live picks on started games; scoreboard is ATS 0–1–1, totals 0–2–0, margin MAE 13.5, total MAE 20.3. `origin/main` at `1c5b224`. Sat 20:00 rebuild path is lines → props → dfs. Sun 08:40 full ingest lands Saturday scores; no manual ingest needed before Tue grade. Local Docker is behind 0013/0015/0016/0017/0018 — `nfl-edge db migrate` and confirm pending is empty when it next comes up.

### Usage allocation — hold k=3 through Tuesday (2026-09-12)

`shrink_k_usage` stays at 3 this week. The Tuesday k=0 fallback for week 2 does **not** depend on the gated sweep: if the vector operator is not ready by then, k=0 ships on the backtest already run — 2025 week 2 was the worst week at k=3, and k=0 was better there on both channels. Honest cuts split the problem: at k=3, prior-season target bias is −2.8 pp and carry bias is −7.2 (pred-k3: −3.4 / −10.7). Receptions are mostly volume (team rec p50 18.2 vs 2025 team-game median 21); carries are allocation. Week 1 is not worse than the average (tgt −2.5 / car −4.0); weeks 2–17 carry bias is −7.5 and 2025 week 2 was the worst single week. Gates (both `xfail(strict=True)` until the usage-vector operator; do not loosen the bounds): `test_wr1_renorm_delta_independent_of_room_size` (room-size slope ≈ 0) and `test_many_games_negligible_carries_get_negligible_share` (2 carries / 11 games must stay under 1%, not inherit the RB mean — the Saylors / n_eff-in-games half). Either can pass while the other fails; they are separate halves. When **both** go green, re-run the k sweep — not before. If a positive k wins, the new target carries information and the formulation is sound. If k=0 still wins with a flat slope and Saylors at 1%, the vector target is biased too and there is a third thing to find. DET week-1 ACT RBs: Gibbs / Saylors / Vaki; only Gibbs has carry volume (224 vs 2 / 1); Montgomery is HOU. Primary fat-end check is IND 2025 (Taylor, mean renorm Δ −12.9 / bias −24.1); CLE is the committee illustration only. Player-week OLS n=565, week FE, 30 clusters: alone, delta +0.41 (wild p=0.10) and count −3.8 pp/RB (wild p=0.022); jointly neither survives (delta +0.25 p=0.38, count −2.8 p=0.15). Post-fix test is the count coefficient, not the delta (it becomes degenerate). Pre-registered 2026-09-12 in `tests/test_priors.py` (`POST_FIX_COUNT_COEF_*`, next to the xfails): PASS if |coef| ≤ 1.9 pp and the 95% cluster CI covers 0; FAIL if |coef + 3.8| ≤ 1.4 (holds near −3.8); anything in between is underpowered — more weeks, no verdict. Weekly SE of star-RB bias is 2.8 pp; band the post-fix week trend at ±3 pp. Volume (`neutral_pass_rate`, plays) can start in parallel. Leave Lamb alone.

### Tuesday 2026-09-15 — volume decomposition (do not touch a parameter on two games)

Both finals came in far under on totals (45.3 vs 23, 52.2 vs 34) while receptions props lean the other way (too few catches). Opposite leans argue against a global scale problem. After sixteen games are graded, put **projected vs actual** next to each other for all four, plus sacks:

- drives
- plays per drive
- neutral pass rate
- pass attempts
- sacks (attempts = dropbacks − sacks; an inflated sack rate drags attempts without moving anything else)

Read: plays right + attempts low → pass rate. Plays low → pace, further upstream, and that would also move points. Attempts low + points high localizes the error in the drive → play → attempt chain.

Tighter localization from the 32-team board (run `f049d136`, 2026-09-12): mean gap vs market implied team total is **+0.88 pts/team** (~1.8 pts of total per game). That sits next to the volume finding (team rec p50 18.2 vs 2025 team-game median 21, ~13% light). Both can be true only if **points per drive is too high while drives and plays are too low** — the two errors compensate, which is why totals looked roughly sane while every player projection ran light. Do not treat the two graded TNF/Melbourne unders as the evidence; n=32 against the market is.

### QB-channel target (2026-09-12) — do not patch three times

`spread_gap_vs_market` on `f049d136` is two games, two diagnoses. MIA/LV and CLE are **bugs, not bets**. IND/BAL is a genuine disagreement (2025 IND 436 points; market has them at 22 against BAL) and should be graded.

Mechanism confirmed on the eight Week-1 starter changes: Pearson(factor, pts_gap) **0.71**; changed+factor>1 mean gap **+3.01** vs changed+factor≤1 **−0.55**. The estimator is one-sided. `qb_ypa` shrinks toward league, then divides by the departed starter's team YPA, so a small-sample or missing-sample replacement cannot say "downgrade" — Cleveland is the sharper case (Watson 0 attempts in the 2025-only window → fill-to-league 7.03 / Sanders 6.24 = factor 1.127). Miami at least has 35 attempts at 12.06 YPA (λ=0.19, factor 1.137). Cooper Rush (52 att at 5.83 → 6.72, factor 0.97) shows the other half: a clamp at 1.0 when att are low stops the inflating direction only. The fix is the target (league replacement baseline), not `k`.

The same single-season lookback (`season = S-1` at week 1) produced three symptoms: Lamb's twelve-game injured 2025 as WR1 baseline, Watson's entire 2024 body of work invisible, and small-sample QBs shrinking toward whoever they replaced. **Multi-season lookback with recency weighting is its own item** — do not patch the three symptoms separately. A one-line interim (factor = 1.0 when attempts are zero) is independent of that and of the clamp; nothing ships before the Sunday slate.

## Web v2 — Checkpoint A (2026-09-07)
- Contrast, position pills, Lucide metrics, DataTable URL state, collapsible 216/64 sidebar, `Week 1 › Lineups › DK Main` crumbs, glass shell + field gradient. Prop detail game log is DataTable (`syncUrl={false}`).
- Preview (Deployment Protection on): https://nfl-edge-e7zp5ltd1-transit-trends.vercel.app — `/week/1`, `/week/1/dfs/dk/main`, `/week/1/players/dk/main`, `/props`, `/week/1/optimize/dk/main`. `npm run a11y` (axe via Playwright) found no `color-contrast` violations on those five pages.
- Session-pooler `EMAXCONNSESSION` (pool_size 15) can 500 preview pages under parallel hits; a11y runs one worker with retries. Player library and browser ILP are Part B.

## Phase 2 — DFS (2026-09-06)
- Week 1 DK Main + Full on run `e7a5ff4e` (histograms, 20k): 150 lineups each with win%/ROI in `model.dfs_lineups` / `dfs_exposure`. Upload CSVs at `data/dfs/e7a5ff4e-…/dk/{main,full}/dk_upload.csv`.
- `nfl-edge dfs --slate` is required. `nfl-edge grade` skips DFS until `player_stats_weekly` exists for the week (`dfs: skipped (scores unpublished)` on 2026 wk1).
- Preview: https://nfl-edge-902bjznuh-transit-trends.vercel.app — `/lineups` Week 1 DK Main (150 LineupCards, export, exposure), `/games` sim-score table (16 games). Deployment Protection on. RunBadge footer still says "no run loaded" on those two routes (shell footer); data is in the page body.

### Checkpoint 2
- 150 Week 1 DK Main lineups in `model.dfs_lineups` with win%/ROI; DK upload CSV produced; lineup review and games page render locally and on the preview URL above.

## Phase 3 — props (2026-09-08)
- `model.fair_props` on run `bf9a11f4` (neff-split, 20k): 4140 rows (460 players × 9 stats). Fair line = parquet median on a hook; P(over) from parquet. Anytime TD is P(rush_td+rec_td ≥ 1) stored as probability, shown as American. `nfl-edge lines` writes fair_props then prop_edges.
- Market overlay: 2 `market_props` / 4 `prop_edges` (Gibbs rush 83.5, St. Brown rec 77.5). CSV is optional; `/props` reads `fair_props`. Enter-a-line inserts `market_props` (web_reader INSERT grant in 0011). Edge fills on next `nfl-edge lines`.
- `nfl-edge grade` grades fair_props as a calibration set vs `player_stats_weekly`, separate from market edges; still `props: skipped (scores unpublished)` until Tue 2026-09-15.
- Showdown on the same run: `data/dk/DKSalaries_2026_wk01_showdown.csv` → `2026_01_showdown` (136 rows, 108 matched; Boutte unmatched OUT, no alias). 150 CPT+FLEX lineups. Upload `data/dfs/bf9a11f4-…/dk/showdown/dk_upload.csv`.

### Checkpoint 3
- `/props` is the model-props board (FairPropsIndex): DK pts default sort, STAT_ORDER, Enter a line. Detail uses persisted fair `sentence` until a market line exists. Preview https://nfl-edge-e7zp5ltd1-transit-trends.vercel.app (run `bf9a11f4`). Phase 4 waits for `nfl-edge grade --season 2026 --week 1` on Tue 2026-09-15.

## Phase 1 — web app (2026-09-06)
- Linked `web/` to Vercel project `transit-trends/nfl-edge`. `DATABASE_URL` is the session pooler (IPv4) on Production and Preview. Direct `db.*.supabase.co` does not resolve on Vercel.
- Preview (Deployment Protection on): https://nfl-edge-dj28g8tlj-transit-trends.vercel.app — `/` → `/week/1`, 16 VerdictCards, RunBadge `run 5823f7 · … · 20k`, week summary, same payload as local. Run `5823f735`.
- Local `npm run dev` on :3100: same board; Table view tiles include “No graded weeks yet”; `/props/nope/nobody` is “Player not found”, not 404.

### Checkpoint 1
- UI reads `model.verdicts_latest` / `model.edges_latest` for 2026 week 1 from Supabase. Five warn games are ARI@LAC, BAL@IND, DAL@NYG, MIA@LV, NYJ@TEN. `vercel --prod` left for after this tick if the stable domain should match.

## Phase 0 — operations (2026-09-06)
- ops-cron (3a21561): LaunchAgent template `ops/com.nfl-edge.lines-only.plist` + `ops/lines-only.sh`. Cadence: every 30 min through 2026-09-13 23:59 PT, every 2 h after (wrapper no-ops off the even-hour grid). Overlap swap: bootstrap `com.nfl-edge.lines-only-swap` before bootout of the old 4h calendar agent, then bootstrap the new label, then bootout the swap. `scripts/` plist removed.
- ops-overrides (400fdd4): `nfl-edge overrides --season --week --file` → `raw.player_overrides`. Matcher in `ingest/names.py` (gsis_id, merge_name/display_name + team + position, DST nick/city, `config/dk_aliases.yaml`). CSV documented in `docs/ops.md`. Weekly runbook is an ordered command list.

### Checkpoint 0
- LaunchAgent `com.nfl-edge.lines-only`: `run interval = 1800 seconds`, `runs = 1`, `last exit code = 0` (RunAtLoad ingest at 2026-09-06 12:33:57 MST, `line_snapshots: 0` — nflverse unchanged). Next fire ~12:33:57+1800s = **13:03:57 MST**.
- Two-row fixture `tests/fixtures/overrides_two_row.csv` against Supabase: wrote Mahomes `00-0033873` out (usage_multiplier 0) and Gibbs `00-0039139` questionable (1.0). Test rows deleted after the select so Week 1 priors are not zeroed. `raw.player_overrides` count 0. `raw.market_lines` 1820.

## Step 4 — game lines and edge (2026-09-04)
- migration-edges (26932ce): 0004 re-keys `model.edges` to `(run_id, market_line_id, market_type, side)` + `price`, `p_push`, `hold`; view `model.edges_latest`; `model.verdicts (run_id, game_id, market_line_id, payload jsonb)`.
- tests-edge (a96e5d7): 44 spec tests for odds/de-vig/Kelly/snapshot edges and the verdict grammar, written first, all failing against stubs.
- market-edge (4a548e2): `market/edge.py` — reads `{game_id}.game.parquet` once per game, six rows per market snapshot, `model_prob` = P(win | no push), two-way de-vig, quarter Kelly at the offered price (null odds → −110), `insert_ignore`; parity vs `proj_games.p_home_cover_market` (push = half) 14/14 on 2025 wk10, 16/16 on 2026 wk1. Edge config block in `sim.yaml` (this changes `config_hash` for runs after this commit).
- outputs-lines (b7c9544) + cli-lines (811d3f4): `outputs/lines.py` pure verdict generator (three sentences, Side/Total/Home-wins chips, week summary, invariant-failed game withheld), `config/teams.yaml` (shared-city teams read "the Jets/Giants/Rams/Chargers"), `outputs/lines_io.py` + `nfl-edge lines --season --week [--run] [--json] [--min-edge] [--recompute]`; one `model.verdicts` row per game at the latest snapshot, same idempotency as edges.
- ingest-prekickoff (4873521): seasons ahead of nflverse's date guard load what exists (stats/opportunity/snap_counts skipped with a message; rosters from the preseason roster file); `ingest --lines-only` without `--week` snapshots the whole season and adds missing schedule rows; the live ECR feed (`load_ff_rankings("week")`: `page`, `fantasypros_id`, `player_name`) is normalized to the archive shape — it had never been exercised and would have crashed on the first live Tuesday. `qb.load_starters` keeps string dtypes when no starters are announced (empty result → Null dtype → concat error; found on the first 2026 build). Roster-team review passed: Walker SEA→KC, Etienne JAX→NO, Dowdle CAR→PIT, W. Robinson NYG→TEN all sit on their 2026 team with history keyed by `player_id`; every team's target/carry shares sum to 1.000; 32/32 teams have one QB1 from the depth-chart fallback (schedules has no announced Week 1 starters yet).
- lines-cron-doc (ee532de): `docs/ops.md` — snapshot cadence, weekly order, provenance; README points to it. Installed 2026-09-06 as LaunchAgent `com.nfl-edge.lines-only` (cron daemon not running on this Mac).
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

### lines-refine (display items done in Step 7; Kelly cap still trailing)
- Displayed spread/total now use `mean_spread`/`mean_total` when present (median stays for P(cover)/P(over)). Sentence 1 on the fresh 2025 wk10 run reads "by 5.9 points" not "6.0".
- Line-moved-since-sim clause and `market.moved_since_sim` are in the payload; 2025 wk10 has one snapshot so the clause does not fire.
- `model.verdicts_latest` exists (0005). Chips carry `market_type`/`side`; `calls.cover` is structured (`pays` / `does not pay` / `coin flip`).
- Kelly is still per-market and ignores correlation between a game's spread and moneyline; cap per-game exposure stays in `grade-refine`.

### priors-refine additions from this step
- Exclude or downweight prior-season Week 18 in `history_where`/`with_weights` (resting starters; wk18 MAE 4.75 in the backtest, and the Week 1 rester gap above).
- Announced starters: `schedules.*_qb_id` is empty pre-kickoff; the depth-chart fallback carried Week 1. Re-run `ingest` Wed/Sat so the QB channel picks up announced starters.

## Step 7 — grading (2026-09-06)
- migration-results (e0121e0): 0005 re-keys `model.results` to `(run_id, market_line_id, market_type, side)` with line/price/CLV/pnl columns, `proj_games.mean_spread`/`mean_total`, view `model.verdicts_latest`. Applied locally and on Supabase (empty `results` both sides).
- lines-refine-display (75ef9fc): mean display with median fallback; moved-since-sim; structured chip/call fields. Fresh sim required for mean columns; older runs fall back to the median.
- tests-grade (6bf2e26) + results-grade (63fb129): 40 spec tests then `results/grade.py` (`outcome`, `pnl`, `clv_points`, `pick_close`, `grade_snapshot`, `run`). `infer_schema_length=None` on the results frame so runs without verdicts (null `verdict_call`) can share a table with runs that have `pays`.
- cli-grade (ecdbc94) + calibration-results (c001749): `nfl-edge grade --season --week [--run]`; `output/grading_{season}.md` (CLV-zero header for backfilled seasons).
- test-e2e-grade (1f377ec): `tests/test_grade_e2e.py` (`db`).

### Checkpoint D — 2025 wk10 local Postgres; 2026 wk1 structured verdicts on Supabase
- Fresh local sim `30b9d16c-5f84-4105-a693-657a6ce95756` (5k draws): 14 games, invariants 196/196, warnings 4/28. Verdicts use the mean ("Houston is favored … by 5.9 points"); no moved-since-sim clause (one snapshot per game). `lines --recompute` on `a66ce78b-84cf-4285-afc1-622bfc459076` rewrote the 14 pre-0005 payloads.
- `nfl-edge grade --season 2025 --week 10`: 7 parquet runs, 588 `model.results` rows (7 × 84), 28 verdict rows, 0 unplayed, 0 missing parquet. `close_source = schedules` and `clv_points = 0` on every non-ML row (backfilled snapshots are post-kickoff).
- Picks (`is_last_snapshot and edge > 0`, 42 sides per run = 14 games × 3 markets). Newest run `30b9d16c`: **21-21-0**, flat ROI **+2.3%**, Kelly ROI +21.5%. Spread 7-7-0 (−5.2%), total 7-7-0 (−4.3%), moneyline 7-7-0 (+16.3% — plus-money dogs). The other six runs sit in 20-22-0 to 22-20-0, flat ROI −2.3% to +6.8%. ~50% as expected; overall ROI is not negative because the ML dogs paid more than the spread/total hold lost. Honest number, not a betting green light.
- Verdicts (only the two runs with chips: `30b9d16c` and `a66ce78b`): Side 7-7-0 ROI −5.2%, Total 7-7-0 ROI −4.3%, cover-call accuracy **57.1%** (n=14, coin flips excluded). The five older wk10 runs have edges but no verdict payloads.
- Calibration (all 7 runs, last snapshot, both sides of every market): Brier sim **0.2319** vs close **0.2365**; buckets 0.1–0.9 hit 0.00 / 0.13 / 0.34 / 0.48 / 0.52 / 0.66 / 0.87 / 1.00 (`monotone=True` on this week). Season file `output/grading_2025.md` uses the newest run only (same 21-21-0 / 57.1%).
- Supabase: 0005 applied; `nfl-edge lines --season 2026 --week 1 --recompute` rewrote 16 verdicts with `chips.*.market_type/side` and `calls.cover` (run `5823f735` still has null `mean_*` — median display until that week is re-simmed). No grading until games are played.
- First live grade: `nfl-edge grade --season 2026 --week 1` on Tue 2026-09-15; needs the `--lines-only` job running from now so pre-kickoff snapshots exist for CLV.

### How to read Checkpoint D (do not get excited)
- **Kelly ROI +21.5% on a 50% record is a one-week artifact.** Quarter-Kelly sizes plus-money dogs heavily; two or three of them hit and n is 14 moneyline picks. It will swing the other way on a different week. Watch **flat ROI** until there are ten graded weeks.
- **Brier 0.2319 vs close 0.2365** is the sim beating the market on one week by a hair. Same caveat. Season-wide 2025 was 0.225 vs 0.212 the other way.
- **CLV is zero everywhere** because backfilled snapshots are post-kickoff, as the plan stated. The first CLV that means anything comes from Week 1 pre-kickoff snapshots.

### `--lines-only` job (2026-09-06; replaced same day in Phase 0)
- Replaced by Checkpoint 0 above. Old 4h calendar plist is gone; `ops/` is the source of truth.

### grade-refine (trailing; not started)
- Per-game exposure cap across correlated markets; ROI by kickoff slot and by favorite/dog; player-prop and DFS grading when those views exist; `results` for the sim-time snapshot as well as the last (open-vs-close comparison of the model).

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
- [x] 0 — LaunchAgent 30 min (next fire ~13:03:57 MST 2026-09-06); overrides two-row fixture loaded then deleted
- [x] UI — Edge board live on a Vercel URL reading Week 1 from Supabase (architecture §8 step 4b; plan: web app). Preview https://nfl-edge-dj28g8tlj-transit-trends.vercel.app run `5823f735`.
- [x] A — backfill 2020–2025 loaded, `nfl-edge db counts` printed (local Postgres 2026-09-04; Supabase identical, same day)
- [x] B — `nfl-edge priors --season 2025 --week 10` plausible (see above)
- [x] Backtest 2025 report at 5k draws; invariants 100%; spread MAE 2.60 ≤ 3, total MAE 2.26 ≤ 4
- [x] C — `nfl-edge lines --season 2026 --week 1` prints 16 verdicts from a 20k run and `model.verdicts` holds 16 rows, on Supabase (run `5823f735`) and on local Postgres (run `3d4fe1c7`).
- [x] D — `nfl-edge grade --season 2025 --week 10` on local Postgres: 7 runs, 588 `model.results` rows, picks ~50%, CLV 0 by construction; 2026 wk1 verdicts on Supabase carry structured chip/call fields. First live grade Tue 2026-09-15.
- [x] 2 — 150 Week 1 DK Main lineups + upload CSV; `/lineups` and `/games` on preview https://nfl-edge-902bjznuh-transit-trends.vercel.app (run `e7a5ff4e`).
- [x] 3 — two Week 1 props on `/props`; TNF showdown lineups on run `bf9a11f4` `/week/1/dfs/dk/showdown` (local + preview https://nfl-edge-56byuj1hm-transit-trends.vercel.app). Third prop row never entered. Phase 4 waits for Tue 2026-09-15 live grade.
- Cover-calibration monotonicity vs the close is retired as a build gate (decision, 2026-09-04): a public-data model is not expected to beat the closing line at build time. It is a season-long grading target (Checkpoint D: Brier sim 0.2319 vs close 0.2365 on 2025 wk10). Honest baseline every refinement must beat: sim-vs-result MAE 10.31 against the close's 9.72.

## props-refine (2026-09-07)
- Prior-season week 18 is excluded in `history_where` / `drop_prior_week18`. Usage/efficiency shrink with unweighted `n_eff`; team channel keeps recency-weighted `sum(w)`. Live Week 1 run `bf9a11f4` already used this; do not rebuild until after Tue 2026-09-15 grade.
- Announced starters: `schedules.home_qb_id` / `away_qb_id` still 0/16 for 2026 week 1. Re-ingest Wed 2026-09-09 (TNF) and Sat so the QB channel picks them up. No ingest today.
- Depth-chart cold start now ranks 1–5 (`0.20` / `0.12` at 4/5). Rank 6+ with no history still excluded. Takes effect on the next sim, not the live run.

## Open items for the next plan (lines/edge, DFS export)
- Populate `raw.player_overrides` weekly via `nfl-edge overrides` and DK Status on salary ingest — 156 Week 1 rows from the DK Main CSV (101 out, 55 Q); leftover unmatched names stay in `output/dk_salaries_*.txt`.
- Depth-chart cold start ranks 6+ with no history are still excluded.
- OT is a one-drive resolution (0.4% ties); margin/total sd run ~0.5–1 point wide of NFL history — revisit once P(cover) is graded against real bets.
- Supabase `statement_timeout` is 2 minutes for the `postgres` role. Any future query over `raw.depth_charts` daily rows (1.24M and growing ~3k/day) should filter on `(season, week, club_code)` (the only index) or add an index on `(season, dt)` in the next migration.
