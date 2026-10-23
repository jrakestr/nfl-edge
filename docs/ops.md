# NFL-edge operations

Five LaunchAgents on this Mac run the jobs below. Clock times are America/Phoenix unless a line names another zone. This Mac's clock is America/Phoenix. With `DATABASE_URL` unset, every job uses the URL in `.env`.

`nfl-edge lines` prices the newest `model.sim_runs` row for that week. It does not insert a new row. The board stamp `at run` is that row's `created_at`, shown in Eastern time. A later lines fire keeps that sim until a newer one exists.

## Run from GitHub (Mac off)

GitHub → nfl-edge → Actions → **Run phase** → Run workflow: pick a phase (refresh, ingest,
salaries, sim, lines, props, dfs, grade), optionally "run from here" through DFS, week, slate,
draws, field size, iterations. One pipeline run at a time. DFS upload CSVs are attached to the
run as an artifact. **Refresh** is the only schedule (Thu–Mon 9:00, 12:00, 15:00, 18:00 Phoenix)
and also has its own button. That scheduled run includes a full `ingest espn-league` (standings,
scores, rosters, transactions). The LOC page button dispatches `loc.yml`, which is that pull alone.

Salary files and draws reach the runner through private Supabase Storage:
`nfl-edge storage push-salaries --week W` after saving the DK CSVs, and
`nfl-edge storage push-draws --week W` after a sim on the Mac. A cloud sim pushes its own draws.

Repository secrets (Settings → Secrets and variables → Actions): `DATABASE_URL` (Supabase
**session pooler** URI; the direct host is IPv6-only and unreachable from Actions),
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ODDS_API_KEY`, `FANTASY_PROS_API_KEY`, `ESPN_S2`,
`ESPN_SWID`. The repo is public: workflow logs are public, so nothing may print a secret.

The Mac LaunchAgents below stay until a full week has run from Actions.

## At a glance

- `com.nfl-edge.lines-only` — every even America/Los_Angeles hour, minute 0–14 — odds snapshots, score backfill, edges and verdicts on the existing sim — `output/cron-lines.log`. Does not insert `model.sim_runs`.
- `com.nfl-edge.week-rebuild` — Saturday 20:00 and Sunday 08:40 — a new sim (`sat-final` or `sun-inactives`), then lines, props, and DFS — `output/cron-rebuild.log`.
- `com.nfl-edge.week-grade` — Tuesday 09:00 — grades each completed REG week that still has ungraded games, and skips a week that still has a null `result` — `output/cron-grade.log`. Does not insert `model.sim_runs`.
- `com.nfl-edge.loc-snapshot` — hourly, Thursday–Monday 06:00–19:59 — roster status history and the waiver pool — `output/cron-loc-snapshot.log`.
- `com.nfl-edge.actuals-live` — every 3 minutes — `nfl-edge actuals-live`. Exits immediately outside Thu/Mon 19:00–24:00 ET and Sunday 12:00–24:00 ET, and when no game is live. Writes `raw.live_*` and `model.slate_actuals`. `output/cron-actuals.log`. GitHub Actions workflow `actuals-live` is the backup, every 5 minutes in those windows.

## Weekly checklist

Replace `W` with the NFL week. Run on this Mac with `DATABASE_URL` unset. `lines` is last in each hand run: edges and verdicts stay keyed to the line they were computed against.

Sunday verdicts that were never persisted: `nfl-edge lines --close --run <run_id>` (pre-kickoff snapshot only; marked `backfilled`).

Tuesday, after the 09:00 grade agent:

1. `nfl-edge sim --season 2026 --week W --draws 20000`
2. `nfl-edge lines --season 2026 --week W`

Wednesday / Friday, when the injury report changes a starter or a usage share:

3. `nfl-edge overrides --season 2026 --week W --file data/overrides/2026_wkWW.csv`
4. Repeat steps 1 and 2. Skip step 4 when the override did not change a starter or a usage share.

Saturday 20:00 (`--note sat-final`):

- Put that week's `data/dk/DKSalaries_2026_wkWW_*.csv` files on disk before 20:00. Zero files: the agent prints `no DKSalaries_2026_wkWW_*.csv in data/dk/` and exits 1 before the sim.
- The agent then ingests, loads every salary file, merges DK status, applies `data/overrides/2026_wkWW.csv` when that file exists, pulls FantasyPros injuries (non-fatal), sims 20k, pulls odds, runs lines, props, and one DFS build per salary file.

Sunday 08:40 (`--note sun-inactives`):

- Re-export the salary CSVs before 08:40. Same missing-file exit as Saturday.
- The sim must finish by 08:50 Phoenix. A sim still running then is killed, `drop-incomplete` removes that partial run, and Saturday stays live (`sun-inactives: sim not complete by 08:50, Saturday run kept`). The same removal happens when the Sunday game count does not match the slate. Any other sim error prints `sun-inactives: sim failed, Saturday run left intact` and exits with the sim's code. That path does not call `drop-incomplete`.
- Lines, props, and DFS then run to completion. A line is logged if the clock passes 09:30. Lineups and Optimize keep Saturday's lineups and show `Sunday build in progress` until the new run has `dfs_lineups`.

## Scheduled jobs

### Failure

A top-level `capture` logs `unreachable, skipped` and exits 0 when the command output matches `ops/unreachable.sh` (connection errors, timeouts, or the text `github.com`). `loc-snapshot.sh` uses the same check inline.

`capture` inside `$(...)` does not stop the parent. The skip text becomes the command's result. That happens for `current-week`, `newest-run`, and `slate-count` in `ops/week-rebuild.sh`, for `completed-weeks` and `ungraded-completed` in `ops/week-grade.sh`, and for `stale-weeks` in `ops/lines-only.sh`.

nflreadpy downloads nflverse files from `github.com/nflverse/nflverse-data`. The schedule file is `schedules/games.parquet`. Any `github.com` in the output counts, including the other files a week ingest downloads from that host.

`db.py` replaces a connection `OperationalError` with `could not connect using DATABASE_URL (OperationalError); check host reachability and that the password is percent-encoded` and drops the driver message. The matcher keys off `could not connect`.

### lines-only

- Trigger: `StartInterval` 1800, `RunAtLoad` set. The script's cutoff `2026-09-13 23:59:59` America/Los_Angeles is in the past, so every fire is gated: only an even Los Angeles hour with minute under 15 proceeds. Any other fire exits 0 with no log line.
- Writes: Odds API rows in `raw.market_lines` (`fetched_at` makes each pull unique), nflverse score and schedule updates, edges and verdicts for each stale week on that week's newest sim.
- Does not write: a `model.sim_runs` row. The board stays on the last sim.
- Log: `output/cron-lines.log`.

Steps, in order: `nfl-edge ingest odds-api` (`h2h,spreads,totals`, 3 credits), `nfl-edge ingest --season 2026 --lines-only`, then `nfl-edge lines` for each week from `stale-weeks`. `RecentDuplicate` is a no-op. Any other odds-api failure logs one line and nflverse plus `lines` still run. Each pull prints `remaining=`; under 100 is a warning.

The hour check uses `America/Los_Angeles`. The grid is the twelve even hours, all day, about 36 credits (3 × 12) when each of those fires lands before minute 15, plus 3 more on each week-rebuild. There is no daytime window. Until 2026-11-01 those hours match Phoenix. After that date Pacific standard time is one hour behind Phoenix, so an even Los Angeles hour is an odd Phoenix hour.

`nfl-edge ingest --season 2026 --lines-only` pulls the nflverse schedule for the whole season. New `game_id`s are inserted into `raw.schedules`. Existing rows receive `away_score`, `home_score`, `result`, `total` (score sum), and `overtime` when those values change. Kickoff, teams, stadium, and the betting columns stay as stored. The same pull inserts nflverse rows into `raw.market_lines` with `on conflict do nothing`. Those rows have null `bookmaker` and `fetched_at`, so an unchanged line is a no-op. An Odds API pull is a new row because `fetched_at` is in the unique key.

nflverse schedule lines are not a live odds feed. Snapshot resolution is bounded by upstream refresh. Games kicking off before `2026-09-20T00:00:00Z` stay on nflverse everywhere. From that instant the reference book is DraftKings (`config/line_reference.yaml`, `model.line_reference`). A DraftKings row missing spread or total falls back to nflverse.

Verify: `launchctl print gui/$(id -u)/com.nfl-edge.lines-only` (`state`, `runs`, next interval).

### week-rebuild

- Trigger: Saturday 20:00 and Sunday 08:40, Mac clock. No `RunAtLoad`. Week comes from `nfl-edge current-week`, not the plist.
- Writes: a sim with `--note sat-final` (Saturday) or `--note sun-inactives` (Sunday), 20k draws, then lines, props, and DFS for each salary file on disk.
- Does not write: the live Sunday sim when the clock is already 08:50, when the sim is still running at 08:50, or when the Sunday game count does not match the slate. Those paths remove the partial run and leave Saturday live. A Sunday sim that errors some other way is not removed.
- Log: `output/cron-rebuild.log`.

Order: ingest for the week, `dk-salaries --salaries-only` per file, `dk-salaries --merge-status`, optional `data/overrides/2026_wkWW.csv`, `ingest fantasypros-status` (one line and continue on failure), sim, one odds-api pull (3 credits), lines, props (`data/props/props_2026_wkWW.csv` when that file exists, otherwise `props` with no `--file`), `dfs --lineups 150 --field 20000` once per salary file, then `benchmark fantasypros` and `ingest fantasypros-rankings` (both non-fatal).

An odds-api failure here stops the job before lines, props, and DFS. `RecentDuplicate` does not. Unreachable logs `unreachable, skipped` and exits 0. Any other odds failure exits with that command's code. `lines-only` does the opposite: it logs the odds failure and continues.

Verify: `launchctl print gui/$(id -u)/com.nfl-edge.week-rebuild` shows both calendar intervals and no `RunAtLoad`.

### week-grade

- Trigger: Tuesday 09:00. No `RunAtLoad`.
- Writes: grades for each completed REG week that is not already fully graded, after ingest and an NFLGameSim benchmark refresh.
- Does not write: a grade for a week that still has a null `result`. The missing `game_id`s are printed, that week is skipped, and other weeks in the list are still graded. If any week was skipped, the process exits 1.
- Log: `output/cron-grade.log`.

It prints `completed weeks:` and `ungraded completed:` on every fire. A week counts as completed when its last `gameday` is before today.

Verify: `launchctl print gui/$(id -u)/com.nfl-edge.week-grade` shows Tuesday 09:00.

### loc-snapshot

- Trigger: hourly (`StartInterval` 3600). Proceeds Thursday through Monday, 06:00–19:59. Every other fire exits 0. No `RunAtLoad`.
- Writes: one append of current-week roster statuses to `fantasy.loc_status_snapshots`, and a replace of `fantasy.loc_available` (waiver and free agents, one player request, limit 200, plus the pro schedule so bye weeks are real).
- Does not write: either table when the roster or the pool comes back empty, or when the fetch fails. A status change between two pulls is invisible until the next successful pull. `/league` shows the pull time next to every status.
- Log: `output/cron-loc-snapshot.log`.

Command: `nfl-edge ingest espn-league --season 2026 --snapshot-only`. Needs `ESPN_S2` and `ESPN_SWID` in `.env`. An output that matches `ops/unreachable.sh` logs `unreachable, skipped` and exits 0. An ESPN API error is raised as `ESPN request failed (...); nothing was written` and exits non-zero. An empty roster or an empty pool exits non-zero with its own message and writes nothing. A full `ingest espn-league` (not this job) also appends a status set and replaces the pool. Standings and the Pulled from ESPN stamp on `/league` move only on that full pull.

The window is Thursday through Monday, 06:00–19:59 Phoenix. Tuesday and Wednesday never pull. A change at or after 20:00 Phoenix waits until the next open hour: Friday 06:00 after Thursday, Thursday 06:00 after Monday.

Check the window without calling ESPN: `LOC_SNAPSHOT_DRY=1 LOC_SNAPSHOT_DOW=4 LOC_SNAPSHOT_HOUR=12 bash ops/loc-snapshot.sh`.

Verify: `launchctl print gui/$(id -u)/com.nfl-edge.loc-snapshot`.

## Install and swap

Same `Label` cannot be loaded twice. Bootstrap a temporary overlap agent first, then replace. `lines-only` keeps the snapshot chain; the other three use the same shape with their own plist and label.

```
UID=$(id -u)
DEST="$HOME/Library/LaunchAgents/com.nfl-edge.lines-only.plist"
SWAP="$HOME/Library/LaunchAgents/com.nfl-edge.lines-only-swap.plist"
cd ~/Development/nfl-edge
chmod +x ops/lines-only.sh
cp ops/com.nfl-edge.lines-only.plist "$SWAP"
/usr/libexec/PlistBuddy -c "Set :Label com.nfl-edge.lines-only-swap" "$SWAP"
launchctl bootstrap gui/$UID "$SWAP"
launchctl bootout gui/$UID/com.nfl-edge.lines-only
cp ops/com.nfl-edge.lines-only.plist "$DEST"
launchctl bootstrap gui/$UID "$DEST"
launchctl bootout gui/$UID/com.nfl-edge.lines-only-swap
rm -f "$SWAP"
launchctl print gui/$UID/com.nfl-edge.lines-only
```

Reload after editing the checked-in plist with the same overlap swap.

| Agent | Plist | First install |
|---|---|---|
| lines-only | `ops/com.nfl-edge.lines-only.plist` | swap above |
| week-rebuild | `ops/com.nfl-edge.week-rebuild.plist` | same swap; do not set `RunAtLoad` |
| week-grade | `ops/com.nfl-edge.week-grade.plist` | same swap; do not set `RunAtLoad` |
| loc-snapshot | `ops/com.nfl-edge.loc-snapshot.plist` | new label, no swap: `chmod +x ops/loc-snapshot.sh && cp ops/com.nfl-edge.loc-snapshot.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nfl-edge.loc-snapshot.plist` |
| actuals-live | `ops/com.nfl-edge.actuals-live.plist` | new label, no swap: `chmod +x ops/actuals-live.sh && cp ops/com.nfl-edge.actuals-live.plist ~/Library/LaunchAgents/ && launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nfl-edge.actuals-live.plist` |

## Data inputs

### Injury overrides CSV

`nfl-edge overrides --season S --week W --file path.csv` upserts `raw.player_overrides`. Header row required.

- `player` — `gsis_id` (`00-…`) or display name. Same name matching as DK salaries (`merge_name` / `display_name` + optional `team` + `position`; DST → `{team}_DST`; leftovers in `config/dk_aliases.yaml`).
- `status` — `out` | `doubtful` | `questionable` | `active`
- `usage_multiplier` — float, default 1.0. `out`, `doubtful`, and `ir` zero usage in priors regardless.
- `note` — free text
- `team`, `position` — optional disambiguation

Unmatched and ambiguous rows are reported and not written. `questionable` keeps the given multiplier (default 1.0).

### DK salaries

`nfl-edge dk-salaries --season S --week W --slate main` reads `data/dk/DKSalaries_S_wkWW_main.csv` (or `--file`). Writes `raw.dk_salaries` (unmatched names kept with null `player_id`, never dropped) and fills `raw.players.dk_id`. DK `Status` O/OUT and IR → `player_overrides` out (usage 0); D → doubtful (usage 0); Q → questionable (usage 1.0). Unmatched names and skipped overrides go to stdout and `output/dk_salaries_{season}_{week}_{slate}.txt`. Leftover names: `config/dk_aliases.yaml`.

The weekend agent loads each file with `--salaries-only`, then runs `--merge-status` once.

### DK contest results

`nfl-edge ingest dk-folder <dir> [--dry-run] [--force]` reads a folder of DraftKings exports. `draftkings-contest-entry-history.csv` is upserted first (`raw.dk_entry_history`, whole file, never trimmed). Each `contest-standings-<id>.zip` or `.csv` is then classified:

- A zip wins over a loose CSV of the same contest. Identical browser copies (` (1)`) are skipped. Copies whose contents differ are not loaded.
- A 0-byte or unreadable file is listed and not written.
- Only `Classic` game types load. Showdown and in-game files are skipped.
- A file whose sha256 is already on `raw.dk_contests` is left in place. `--force` reloads it.
- `--dry-run` prints the same table and writes nothing.

The contest is tied to a salary slate only when the slate covers the contest's players and the contest covers at least 32% of the slate. Otherwise `slate_id` stays null and the ownership rows still load. After the run, the command lists NFL Classic contests in that date window that have no standings file.

`nfl-edge ingest dk-history <file>` and `nfl-edge ingest dk-standings <file> ...` load one history file or explicit standings files. Run history first so your own entries get slot rows.

### FantasyPros

Key: `FANTASY_PROS_API_KEY` in `.env` (CLI only, never `web/.env.local`). Reference docs: `docs/vendor/fantasypros/`. One call per command (free tier). `week-rebuild.sh` runs status, the projections benchmark, and rankings. A missing key or a failed call prints one line and the rebuild continues.

Manual CSV, DK `Status`, and FantasyPros each write `raw.player_overrides` by their own rule. For a row whose note does not start with `fp `, FantasyPros replaces it, manual included, only when `min(injury_update_date, fetched_at)` is later than that row's `updated_at`. A row whose note already starts with `fp ` is replaced without that time check. `updated_at` moves only when the status changes, so a source that re-confirms an unchanged status does not look newer.

- `nfl-edge ingest fantasypros-status --season S --week W [--dry-run]`: injuries to `raw.player_overrides`, note prefix `fp `. O, IR, PUP, S, NFI → out; D → doubtful; Q → questionable (written only to replace an older saved row that disagrees). QB/RB/WR/TE on teams playing the week. A player FantasyPros stops listing is reported, not cleared. Runs before the sim. A real run (not `--dry-run`) also appends the whole response, practice-only rows included, to `raw.fantasypros_snapshots` (`endpoint='injuries'`); no extra call.
- `nfl-edge ingest fantasypros-injury-reports --season S --week W`: the same call, snapshot only (no override writes). Rows keep status, practice days 1–3, probability of playing, and `injury_update_date` (UTC). A past week's report carries updates made after the games, so a status counts as known before kickoff only when its `injury_update_date` is on or before kickoff.
- `nfl-edge ingest fantasypros-points --season S --start A --end B`: weekly PPR points per offensive player-week into `raw.fantasypros_snapshots` (`endpoint='player_points'`, migration 0035). One call covers the range. A 0.0 does not say whether the player played. Used by the LOC league page as an independent check on ESPN actuals (`fantasy.loc_player_week_check`).
- `nfl-edge benchmark fantasypros --season S --week W`: projections into `raw.fantasypros_snapshots` (one `fetched_at` per pull, never overwritten) and the latest into `raw.external_players` (`source='fantasypros'`; `fpts_std`, `fpts_ppr`, and `fpts_dk`: the same stat means scored with the DK rules in `config/scoring.yaml`, bonuses as probability × bonus points).
- `nfl-edge ingest fantasypros-rankings --season S --week W`: weekly ECR into `raw.fantasypros_snapshots`. `raw.ff_rankings_weekly` stays the nflreadpy archive.

Benchmark only until promoted (gate in AGENTS.md). Nothing in `sim/` or `priors/` reads the snapshot tables. Unmatched players are kept with a null `player_id` and listed.

### RTS projections

`nfl-edge benchmark rts --season S --week W` reads `data/benchmarks/rts_projections_<season>_week<WW>.csv` (or `--file`) and upserts `raw.external_players` with `source='rts'` and `fpts_dk`. Nothing in `sim/` reads that table, and the player page does not load it. `rtsByPlayer` in `web/src/lib/queries/players.ts` is unused.

### NFLGameSim weekly paste

Paste the mygamesim page (all weeks shown) into `docs/nflgamesim-weekN.md`, then run `nfl-edge benchmark nflgamesim --season 2026 --file docs/nflgamesim-weekN.md`. Every week in the paste is rewritten in `raw.external_games` and `data/benchmarks/`; the Grading page compares it to ours. For each week it grades, the Tuesday agent runs `nfl-edge benchmark nflgamesim --season 2026 --week W --refresh-actuals` before the grade.

## Web

The Next.js app in `web/` reads Supabase from server components. It does not generate verdicts. Writes from the app: a typed insert into `model.market_props`, inserts into `model.usage_claims` and `model.llm_calls`, and a promote that upserts `raw.player_overrides`. Numbers on the Edge board that are ahead of the last `lines` run come from `proj_games.line_grid` (a lookup, not a new projection).

Player library: `/week/[n]/players/dk/{slate}`. Browser optimizer: `/week/[n]/optimize/dk/{slate}`. Browser-optimized lineups are graded only after the CSV is exported and that slate is entered. The weekly `nfl-edge dfs` 150 (`model.dfs_lineups`) remain the graded set. Exports put `run_id`, `slate_id`, and `source` (`sim`, `user-optimized`, or `single`) in the filename (`dk_upload_<slate_id>_<run_id first 8>_<source>.csv`). Line 1 is the DK header. Grade an entered upload from that name and the CLI path `data/dfs/<run_id>/<site>/<slate>/`. Pick one on Lineups writes the `single` file from one of the 150.

Sentences stay on the last `nfl-edge lines` write. The lines agent runs that after a snapshot when a week is stale. The sim those sentences describe stays the newest `sim_runs` row.

- **App**: `web/`, Next.js, `engines.node` `>=22`. Env var `DATABASE_URL` in `web/.env.local` (gitignored) and in the Vercel project for Production and Preview.
- **Role**: migration `0006_web_reader_role.sql` creates `web_reader` with SELECT on `model` and `raw`, a 15 s statement timeout, and no password. The password is set once in the Supabase SQL editor. Later grants: INSERT on `model.market_props` (`0011`), INSERT on `model.llm_calls` (`0020`), INSERT on `model.usage_claims` plus INSERT and UPDATE on `raw.player_overrides` (`0021`). Migration `0032_web_reader_fantasy.sql` adds SELECT on `fantasy` for `/league`.
- **Freshness**: every `page.tsx` under `web/src/app` is `force-dynamic`. A new `sim` or `lines` run shows on the next request. After a snapshot the board looks up P(cover)/P(over) from `line_grid` against the current line. The RunBadge shows `lines as of` and `verdicts as of` in the viewer's local timezone. `at run` on a check stays Eastern. Run `lines` last in the weekly order.
- **Connections**: `postgres.js` pool `max: 3` per instance (`web/src/lib/db.ts`).
- **Deploy**: `cd web && vercel link` once, `vercel` for a preview, `vercel --prod` for production.

## Provenance

Every `sim` run records `git_sha`, `config_hash`, and `draws_per_game` on `model.sim_runs`. `lines` resolves the newest run for the week unless `--run` is given. Edges and verdicts are keyed to the `raw.market_lines.id` they were computed against, so a later line does not overwrite an earlier verdict.

## Appendix: 2026 Week 1

The 30-minute lines cadence ended Sunday 2026-09-13 23:59 America/Los_Angeles. After that cutoff the even-hour rule in `ops/lines-only.sh` is the live one.

`STATUS.md` still contains the Week 1 note, and that note was not updated: one nflverse `raw.market_lines` row per 2026 game at the time, and the closing-line cadence was never recorded. Odds API rows since `2026-09-20` are additional rows. They do not replace that note.

Wednesday 2026-09-09 ~15:00 (before NE@SEA lock, 20:20 ET / 18:20 Phoenix)

1. Re-export TNF showdown from DK → `data/dk/DKSalaries_2026_wk01_showdown.csv`
2. `nfl-edge ingest --season 2026 --week 1`
3. `nfl-edge dk-salaries --season 2026 --week 1 --slate showdown`
4. `nfl-edge sim --season 2026 --week 1 --draws 20000 --note wed-final`
5. `nfl-edge lines --season 2026 --week 1`
6. `nfl-edge props --season 2026 --week 1 --file data/props/props_2026_wk01.csv`
7. `nfl-edge dfs --season 2026 --week 1 --site dk --slate showdown --lineups 150` (field size and iterations from `config/sim.yaml` `dfs:`; `--field-size`, `--iterations`, `--full-field` override)
8. `cd web && vercel` (preview, not `--prod`)

Saturday 2026-09-12 20:00 (LaunchAgent, `--note sat-final`): Main and Full CSVs on disk before 20:00. The agent ran the rebuild. No Vercel CLI.

Sunday 2026-09-13 08:40 (LaunchAgent, `--note sun-inactives`): re-export Main and Full before 08:40. Sim dead at 08:50 keeps Saturday. No Vercel CLI.

## DFS lineup audit

`uv run nfl-edge dfs-validate --file data/dfs/<run>/dk/<slate>/dk_upload_<slate_id>_<run8>_<source>.csv [--slate-id 2026_06_main]` re-checks every row against DK rules using that slate's `raw.dk_salaries`. Prints one line per lineup and exits 1 on any failure. The pipeline runs the same audit before it persists or writes an upload, so this is for files built elsewhere (the web Optimizer's `user-optimized` export, older files).

## Optimal-frequency prototype

`uv run python scripts/optimal_freq.py --run <run_id|prefix> --slate main --draws 300` re-solves the classic MILP once per sampled correlated draw and writes `data/dfs/<run>/dk/<slate>/optimal_freq.csv` (optimal %, `own_field_sim`, `own_field_proj`, leverage). Read-only on the DB. About 0.04 s per draw. Not part of the pipeline; see STATUS.md 2026-10-19 for the gate result.

## Research Lab fields

`uv run nfl-edge research build --week W` (after ingest for week W-1 results). Reads only weeks before W, replaces `model.research_fields` for (season, W) in one transaction, and exits non-zero with the missing input named if usage priors or in-season games are absent. Rerunnable. The `/research` page shows "No research data" until it has run for the displayed week.
