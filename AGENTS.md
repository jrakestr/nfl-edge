
# nfl-edge rules

## Plan Files Specification (Mandatory)

Every task plan file generated MUST strictly contain the following three level-2 (`##`) headings in this exact sequence. Plans missing any section or altering the order are strictly invalid. Never bury acceptance criteria within the user story, overview, or execution steps.

```markdown
## User story
## Acceptance criteria
## Steps
```

### Acceptance Criteria Format
Under `## Acceptance criteria`, specify each testable scenario under its own `### Scenario N: <Title>` heading using the standard Given / When / Then format:
* **Given** [initial context or system state]
* **When** [action or event occurs]
* **Then** [expected outcome or assertion]

Read docs/purpose.md before planning any change. docs/architecture.md is the design.

- One simulation per game; every output (lines, props, DFS, showdown) reads from the same draws. Never compute a projection outside sim/.
- No paid data sources. nflverse via nflreadpy, free schedule lines, manual prop lines only.
- Full draws go to parquet under data/draws/; Postgres holds summaries keyed by run_id.
- Invariants before features. The TD-sum and QB-yards checks must hold in every draw; do not add refinements until the current backtest passes.
- Priors must use only rows with season < S or week < W. ffopportunity _exp for week W never enters week W priors.
- Do not widen a plan's scope. Refinements go to the trailing todo, not the current one.
- Every sim output must carry a run_id so it can be graded against results and closing lines.

# How I work in this repo

- Tests before code for sim/ and scoring: the invariant tests are the spec. Make them fail, then make them pass.
- One commit per plan todo, message prefixed with the todo id (e.g. `ingest-players: ...`).
- A todo is done when `pytest` passes, `ruff check` is clean, and the summary is three lines: what changed, what was verified, what was deferred.
- Do not edit the plan file. If scope must change, stop and report; the decision is mine.
- Start a new conversation at each checkpoint. Carry state through the plan file and STATUS.md, not chat history.
- Never print or paste .env contents or DATABASE_URL. Verify the DB connection with `nfl-edge db counts`.

## Learned User Preferences

- On first pull of each nflverse dataset, print the actual column names before writing ingest code. If a planned column is missing, stop and report; do not guess.
- Do not start plan execution until the user explicitly says to execute. Plan mode, a mode switch, and CreatePlan are not a go signal. Do not re-send a plan the user already has.
- Never add dark mode. Follow docs/design-system.md for the web app.
- Treat Flat ROI as the headline until there are ten graded weeks. Do not treat single-week Kelly ROI or one-week Brier as evidence the model beats the market.
- Persist Python-generated copy (verdicts, PropCallout) in Postgres. The web app is read-only except the server action that inserts a typed line into `model.market_props`; do not reimplement those generators in TypeScript.
- Web todos also need `npm run lint && npm run typecheck && npm test && npm run build` green.
- Treat star underprojection vs posted prop lines as a model-miss warning, not an under lean; books set lines near the median, so a sound model should land ~40-60% on posted lines.
- Do not ship Sunday DFS/prop leans from a run that systematically underprojects stars; if a priors correctness fix worsens backtest MAE beyond noise, stop before rebuilding the live week.
- Do not change a sim parameter on a sample smaller than a full week of graded games. Do not tune usage `k` against posted lines; calibrate out of sample against realized share.
- Do not re-run the usage `k` sweep until both usage-vector xfails are green (`test_wr1_renorm_delta_independent_of_room_size` and `test_many_games_negligible_carries_get_negligible_share`). Do not loosen those bounds. If both pass and k=0 still wins, the vector target is biased — find the third problem; do not treat k=0 as the fix. The Tuesday week-2 k=0 fallback is uncoupled from that sweep: if the vector operator is not ready, ship k=0 on the existing backtest (2025 week 2 worst at k=3; k=0 better on both channels).
- Put durable standing rules in AGENTS.md; one-time Tuesday or week checklists belong in STATUS.md.
- Fail closed with a plain-language reason: never publish a partial sim, silently drop a forced optimizer pick, or invent a missing opposite price to de-vig a one-sided prop.

## Learned Workspace Facts

- GitHub remote is jrakestr/nfl-edge (private). Production is the Git deploy of `web/`; never `vercel --prod` from the repo root (it uploads `data/draws/`).
- `.env` DATABASE_URL is Supabase; unset it to use the local Postgres container (port 5433, database `nfl_edge`, not default `postgres`) for 2025 backtests.
- Market spread/total never enter `sim/game.py` or `sim/players.py`; `slate.py` loads them only for P(cover)/P(over) summaries.
- The web app lives in `web/`. The Edge board reads `model.verdicts_latest` and `model.edges_latest`; do not fall back to verdict payload `edges[]`. After a column rename or add, regen `web/src/lib/database.types.ts` (`npm run types:gen` in `web/`) and keep it committed; typecheck/build fail if a query names a missing column.
- Displayed spread/total use `mean_spread`/`mean_total`; median stays for P(cover)/P(over).
- DK salary CSVs live in gitignored `data/dk/`. Player-ID joins go through `raw.players` and `raw.dk_player_crosswalk` (LAR→LA, JAC→JAX, WSH→WAS). DFS is slate-scoped (main/full/showdown have distinct DK IDs); upload CSVs must use that slate's IDs. Status O/D/Q on ingest writes `raw.player_overrides`; the UI reads overrides live, and OUT/D set after the run's `created_at` grey the projection and drop the player from the optimizer pool.
- Calibration monotone against the close is a season-long grading target, not a sim build gate.
- Recency weights belong on the prior rate. Shrinkage `n_eff` is the Kish effective sample size `(Σw)² / Σw²` on the same weights that enter the weighted mean (game-level `w` for usage, team strength, and QB start-share; touch-level `n·w` for efficiency and QB YPA). Do not use raw game/touch count or `sum(w)` as `n_eff`. Prior-season week 18 is excluded from the history sample in all channels.
- Player props on the board come from `model.fair_props` (sim medians, rounded to the nearest half), written by `nfl-edge lines`. The manual market CSV is optional for edges only. Fair-line calibration is graded separately from market-priced edges.
- Browser-optimized lineups are not graded unless exported and entered; the weekly sim lineups remain the graded set. Locks and required-stack players are exempt from exposure caps; a lock means in the lineup (showdown: `c_i + f_i = 1`), not a specific slot.
- Grade each game against the newest `sim_runs` row predating kickoff; the board reads `model.results` and does not re-select the run. Neutral games use `gameday` 00:00 ET as the cutoff. `lines-only` never writes scores; finals need a full ingest.
- Prune draw parquet only after the week is graded (or an age fallback); keep `sim_runs` rows and null `draws_path`. Fail the sim if any game lacks player draws rather than publishing a partial slate.
