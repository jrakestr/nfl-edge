# Workflow in the cloud: trusted DFS, then C–F

Structural assumptions (read 2026-10-16):
- `workflow.py` = phase registry; `nfl-edge phase` runs/chains; `SqlRecorder` → `ops.workflow_runs` (0039, applied).
- `lines` (`market/edge.py`), `props`, `dfs` (`dfs/construction.py`) read local parquet under `data/draws/{s}/{w}/{run_id}/` (~58 MB/run). Separate cloud jobs need those draws.
- `dk.week_dk_csvs` discovers slates from local `data/dk/`. Cloud runner has none.
- `rebuild.sim_lock` = file `flock`; only guards one machine.
- Web: Next 16, `postgres` client as `web_reader`; server actions in `web/src/lib/actions/`; no auth anywhere; nav in `web/src/lib/config.ts` (`NAV`).
- No `.github/workflows/` yet. LaunchAgents still fire Sat 20:00 / Sun 08:40 / Tue 09:00 / hourly.
- Vendored tools lack the old checkout's uncommitted `max_exposure` lock (optimizer + showdown). `.env` override removed today → next DFS run is uncapped.
- Matmul overflow warnings = Apple Accelerate FP-flag noise (finite, matches einsum to 1e-15).
- Field generator puts 0-projection players in 24–31% of field lineups; sim scores them 0 → Win%/ROI inflated. Upload lineups unaffected.

## User story

As the operator, I open the production site, upload the week's DK salary files, press a phase (or "run from here"), and watch each phase's status and duration, with my Mac off. Only refresh (lines + change check) runs on a schedule. DFS output is checked for correctness, not just speed.

## Acceptance criteria

### Scenario 1: Exposure cap holds on vendored tools
- **Given** `config.json` `max_exposure` 40 and 150 lineups
- **When** `nfl-edge dfs` runs classic or showdown from `vendor/NFL-DFS-Tools`
- **Then** no non-locked player appears in more than 60 lineups, and the run prints the resolved tools path under `vendor/`

### Scenario 2: Field has no unprojected players
- **Given** a slate with players at Fpts ≤ 0
- **When** the GPP field is generated
- **Then** zero field lineups contain a player missing from the sim dict, and the log has no "Missing player in sim dict" lines

### Scenario 3: Week 6 DFS re-run validates
- **Given** sim run `27898e5a` and the five week 6 salary files
- **When** `phase dfs --week 6` runs on the vendored tools
- **Then** each slate writes 150 upload rows with DK header line 1, exposure ≤ cap, field size 3000 incl. dupes, no NaN/inf, ≤ 3 min per slate, and a comparison vs the first run is written to STATUS

### Scenario 4: Salary upload is private and reproducible
- **Given** a DK CSV uploaded on /workflow for week W, slate S
- **When** it is stored
- **Then** it lands in private bucket `salary-files` at `{season}/wk{WW}/{slate}/{sha256}.csv`, `ops.salary_files` records id, sha256, bytes, original name, uploaded_at, and a re-upload of the same bytes is a no-op

### Scenario 5: A job uses the intended file
- **Given** two uploads for the same slate
- **When** a phase is triggered
- **Then** the dispatch passes the chosen `salary_file_id`s, the runner verifies sha256 before use (mismatch → fail closed), and `ops.workflow_runs` records those ids

### Scenario 6: Run record is complete
- **When** any phase runs (local or Actions)
- **Then** its row has phase, season, week, slate, commit SHA, settings, inputs, salary file ids, status, started/finished, message, error, host, GitHub run URL

### Scenario 7: No overlapping runs
- **Given** a running row for (phase, season, week, slate)
- **When** the same phase is triggered from web, Actions or the Mac
- **Then** the second start is refused with a plain message; a row stuck `running` past its timeout is marked `failed` (stale) before the guard checks

### Scenario 8: Cloud DFS reads persisted draws
- **Given** a sim that finished in an earlier job
- **When** `phase dfs` runs alone on a runner
- **Then** it downloads that run's draws from private bucket `draws` and produces the same files as a local run

### Scenario 9: Trigger from the page, no long work in the request
- **When** I press a phase on /workflow
- **Then** a server action validates inputs, calls GitHub `workflow_dispatch`, returns at once; the page shows the new row from `ops.workflow_runs` as running → success/failed with duration and a link to the Actions run

### Scenario 10: Secrets stay server-side
- **Then** no `NEXT_PUBLIC_` var holds a key; `SUPABASE_SERVICE_KEY` and `GITHUB_DISPATCH_TOKEN` are read only in server modules; `npm run build` client bundles contain neither name's value

### Scenario 11: Only refresh is scheduled
- **Then** `.github/workflows/` has exactly one `schedule:` (refresh); every other workflow is `workflow_dispatch` only

### Scenario 12: Mac schedules retire last
- **Given** one full week of successful Actions runs (refresh, salaries → DFS chain, grade)
- **When** F runs
- **Then** `com.nfl-edge.*` LaunchAgents are unloaded and removed, `ops/*.sh` deleted, docs/ops.md describes only Actions + /workflow

## Steps

Part 0 — trust DFS (before any C–F)
1. `vendor-exposure-tests`: failing tests in `vendor/NFL-DFS-Tools/tests` for the classic and showdown exposure lock and a 0-projection field player.
2. `vendor-exposure`: port the `max_exposure` lock from `~/Development/NFL-DFS-Tools` (uncommitted) into the vendored optimizers; note in VENDORED.md.
3. `vendor-field-projected`: field generator skips players with Fpts ≤ 0 (same filter as the game sim); VENDORED.md.
4. `vendor-matmul-noise`: wrap the correlation block in `np.errstate(all="ignore")` + assert finite `Z_corr`; fail closed if not finite.
5. `tools-path-canonical`: drop `NFL_DFS_TOOLS_PATH` from `config.py` and `.env.example`; `dfs` prints the resolved tools path.
6. `wk06-dfs-validate`: re-run `phase dfs --week 6`; check Scenario 3; STATUS entry with before/after exposure and Win%/ROI.

C — storage
7. `ops-schema-2`: migration 0040: `ops.salary_files`; `workflow_runs` + `commit_sha`, `inputs jsonb`, `salary_file_ids bigint[]`, `error text`, `timeout_at`; partial unique index on running (phase, season, week, coalesce(slate,'')); grants (web_reader select; insert on `salary_files` only). `npm run types:gen`.
8. `storage-tests` → `storage`: `nfl_edge/storage.py` (service key, private buckets `salary-files`, `draws`): put/get with sha256; `nfl-edge salaries pull --week` materializes `data/dk/` from chosen ids, verifies hash.
9. `draws-sync`: sim phase uploads the run's draws to `draws/{s}/{w}/{run_id}/`; lines/props/dfs fetch when local is missing. Retention per Unresolved Questions.
10. `recorder-guard`: `SqlRecorder` writes commit SHA, inputs, file ids, error; stale-running reaper; refuse on unique-index conflict (Scenario 7). Replaces reliance on file `flock` across hosts.

D — Actions
11. `actions-phase`: `.github/workflows/phase.yml` (`workflow_dispatch`: phase, week, slate, from, draws, field_size, iterations, full_field, salary_file_ids): checkout, uv, vendored tools env, `nfl-edge db migrate`, `salaries pull`, `nfl-edge phase …`; `concurrency: phase-${season}-${week}-${phase}-${slate}`, sim/`--from` share `sim-${season}-${week}`; `timeout-minutes`.
12. `actions-refresh`: `.github/workflows/refresh.yml` on schedule + dispatch.
13. `actions-grade`: grade via phase.yml (dispatch only).
14. `secrets-doc`: `.env.example` + docs/agents/infra.md list every var by home: GitHub secrets (7), Vercel server env (`DATABASE_URL` web_reader, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `GITHUB_DISPATCH_TOKEN`, `GEMINI_API_KEY`), local `.env`.
15. `actions-smoke` (operator + me): after you add secrets, dispatch refresh, then `--from salaries` for the current week; record timings on a 2-CPU runner in STATUS.

E — /workflow page
16. `workflow-queries-tests` → `workflow-queries`: `web/src/lib/queries/workflow.ts` (runs, salary files, change check) + display helpers in a SQL-free file.
17. `workflow-actions`: server actions `uploadSalaryFile` (CSV header check, size cap, sha256, storage put, row insert) and `triggerPhase` (input validation, open-row check, GitHub dispatch); both behind the access gate.
18. `workflow-page`: `/workflow`: phases in order with last status, started, duration, run link; per-phase Run + "run from here"; DFS per slate; salary uploads per slate with hash/time; latest change check; polls while a row is running. Nav entry in `NAV`.
19. `web-docs`: docs/agents/web.md data boundary adds the two writes and the gate.

F — retire the Mac
20. `retire-launchagents`: after Scenario 12's week, unload/remove `com.nfl-edge.*`, delete `ops/*.sh`, rewrite docs/ops.md, STATUS entry.

## Unresolved Questions

- Saturday 20:00 LaunchAgent runs DFS tomorrow on the vendored tools without the exposure cap. Restore the `.env` override until step 2 lands, or pause that agent?
- Access gate for /workflow (site has no auth): Vercel Deployment Protection, a single shared passphrase cookie, or Supabase Auth with one allowed email?
- Web upload needs storage writes. OK to put `SUPABASE_SERVICE_KEY` in Vercel server env (server-only), or upload through a narrower Storage policy/role instead?
- GitHub dispatch token: fine-grained PAT (actions:write, this repo only) in Vercel server env — OK, and who owns rotation?
- Refresh schedule: which hours/days (Phoenix), and Odds API credit budget per week (3 credits per pull)?
- Draws retention in Storage: keep newest complete run per week only, or N runs / N weeks? (~58 MB per run; free tier 1 GB.)
- Stale `running` timeout per phase (proposed: sim 20 min, dfs 10, others 15)?
- Should the Sunday "sim must finish by 08:50" cutoff come back for cloud runs, or stay dropped?
- Keep `NFL_DFS_TOOLS_PATH` support at all (step 5 removes it), or keep it for local experiments?
- DFS field fix (step 3) changes Win%/ROI for past weeks' comparisons. Re-run weeks 4–5 for a fair baseline, or start the series at week 6?
