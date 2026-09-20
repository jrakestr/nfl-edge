# Operations: line snapshots and the weekly run order

Scheduled on this Mac as three LaunchAgents. `com.vix.cron` is not running here, so a crontab
would never fire.

- `com.nfl-edge.lines-only` runs `ops/lines-only.sh`: `nfl-edge ingest odds-api` (`h2h,spreads,totals`,
  3 credits) then `nfl-edge ingest --season 2026 --lines-only` then `nfl-edge lines` for each stale
  week. `RecentDuplicate` is a no-op; any other odds-api failure logs one line and nflverse +
  `lines` still run. Each pull prints `remaining=`; a `<100` line is a warning. Log:
  `output/cron-lines.log`.
- `com.nfl-edge.week-rebuild` runs `ops/week-rebuild.sh` Saturday 20:00 and Sunday 08:40 MST
  (Mac clock = Phoenix). Week comes from `raw.schedules` (`nfl-edge current-week`), not the
  plist. Saturday `--note sat-final`. Sunday `--note sun-inactives`: sim must finish by 08:50
  or the Saturday run stays live; lines/props/dfs then run to completion (DFS main before full)
  with a 09:30 soft-ceiling log. No `RunAtLoad`. Log: `output/cron-rebuild.log`.
- `com.nfl-edge.week-grade` runs `ops/week-grade.sh` Tuesday 09:00 Phoenix. Lists every REG week
  whose last `gameday` is before today; for each week that is not already fully graded it ingests,
  refuses to grade if any game still has a null `result` (missing `game_id`s named, exit
  non-zero), and grades the ones that are complete. Always prints completed-vs-ungraded so a
  skipped week stays visible. No `RunAtLoad`. Log: `output/cron-grade.log`.

`DATABASE_URL` is unset so `.env` (Supabase) is used. If the database or github.com is
unreachable (Mac asleep or off Wi-Fi) both jobs log `unreachable, skipped` and exit 0.

## Cadence

- Through Sunday 2026-09-13 23:59 PT: every 30 minutes (`StartInterval` 1800).
- After that cutoff: the wrapper no-ops except on even Pacific hours (2 h). `ops-refine` if a
  later TNF/MNF needs a dedicated extra fire. Odds-api cost on that cadence is 3 credits × 12
  even hours ≈ 36 credits/day (plus 3 more on each week-rebuild).
- Reference book is DraftKings from `2026-09-20T00:00:00Z` (`config/line_reference.yaml` /
  `model.line_reference`). Games kicking off before that date stay on nflverse. Incomplete
  DraftKings rows (missing spread or total) fall back to nflverse.
- nflverse schedule lines are not a live odds feed. Snapshot resolution is bounded by upstream
  refresh. During Week 1 count distinct snapshots per game and record the observed cadence in
  `STATUS.md` before treating the last snapshot as the closing line.

```
nfl-edge ingest --season 2026 --lines-only
```

Pulls the nflverse schedule for the whole season and `insert ... on conflict do nothing` into
`raw.market_lines`. An unchanged pull is a no-op. New `game_id`s are inserted. Existing
schedule rows receive `away_score` / `home_score` / `result` / `total` (score sum) / `overtime`
when nflverse publishes a final; kickoff, teams, stadium, and betting columns stay as stored.

## Install / swap (no snapshot gap)

Same `Label` cannot be loaded twice. Bootstrap a temporary overlap agent first, then replace:

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

Reload after editing the checked-in plist (same overlap swap). Confirm the next fire with
`launchctl print gui/$(id -u)/com.nfl-edge.lines-only` (`state` and `runs` / next interval).

Install `com.nfl-edge.week-rebuild` the same way (`ops/com.nfl-edge.week-rebuild.plist`).
Do not set `RunAtLoad`. Confirm both calendar intervals and that `RunAtLoad` is absent:
`launchctl print gui/$(id -u)/com.nfl-edge.week-rebuild`.

Install `com.nfl-edge.week-grade` the same way (`ops/com.nfl-edge.week-grade.plist`).
Do not set `RunAtLoad`. Confirm Tuesday 09:00:
`launchctl print gui/$(id -u)/com.nfl-edge.week-grade`.

## Weekly runbook

Replace `W` with the NFL week. Run in this order, on this Mac, with `DATABASE_URL` unset.

Tuesday 09:00 Phoenix (`com.nfl-edge.week-grade`)

The agent ingests and grades every completed week that is still ungraded. It will not grade a
week until every REG game has a non-null `result`. Reconstruct Sunday verdicts that were never
persisted with `nfl-edge lines --close --run <run_id>` (pre-kickoff snapshot only; marked
`backfilled`). Then start the new week:

1. `nfl-edge sim --season 2026 --week W --draws 20000`
2. `nfl-edge lines --season 2026 --week W`

Wednesday / Friday (injury report)

5. `nfl-edge overrides --season 2026 --week W --file data/props/overrides_W.csv`
6. Re-sim and re-lines only if an override changed a starter or a usage share: steps 3 then 4.

Saturday 20:00 MST (`com.nfl-edge.week-rebuild`, `--note sat-final`)

Drop Main and Full CSVs in `data/dk/` first. The agent runs ingest → dk-salaries main and
full → sim 20k → odds-api pull → lines → props → dfs main then full.

Sunday 08:40 MST (`--note sun-inactives`)

Same order. Sim must finish by 08:50 or Saturday stays live (`sun-inactives: sim not complete
by 08:50, Saturday run kept`). lines/props/dfs then run to completion; a line is logged if the
clock passes 09:30. Lineups/Optimize keep Saturday's lineups and show `Sunday build in progress`
until the new run has `dfs_lineups`.

### Week 1 lock windows

`DATABASE_URL` unset. Drop the DK export in `data/dk/` first (gitignored). `dk-salaries` runs after `ingest` and before `sim` so Status O/D/Q/OUT/IR hit priors, not only the optimizer. Boutte: leave unmatched; no alias.

Wednesday 2026-09-09 ~15:00 MST (before NE@SEA lock, 20:20 ET / 18:20 MST)

1. Re-export TNF showdown from DK → `data/dk/DKSalaries_2026_wk01_showdown.csv`
2. `nfl-edge ingest --season 2026 --week 1`
3. `nfl-edge dk-salaries --season 2026 --week 1 --slate showdown`
4. `nfl-edge sim --season 2026 --week 1 --draws 20000 --note wed-final`
5. `nfl-edge lines --season 2026 --week 1`
6. `nfl-edge props --season 2026 --week 1 --file data/props/props_2026_wk01.csv`
7. `nfl-edge dfs --season 2026 --week 1 --site dk --slate showdown --lineups 150 --field 20000`
8. `cd web && vercel` (preview, not `--prod`)

Report: `run_id`, invariants, override delta vs `output/overrides_2026_wk01_pre_wed.csv` (202 rows at bf9a11f4: 127 out / 75 Q), upload path `data/dfs/<run_id>/dk/showdown/dk_upload.csv`.

Saturday 2026-09-12 20:00 MST (LaunchAgent; `--note sat-final`)

Drop Main and Full CSVs before 20:00. The agent runs the rebuild. No Vercel CLI.

Sunday 2026-09-13 08:40 MST (LaunchAgent; `--note sun-inactives`)

1. Re-export DK Main and Full → `data/dk/DKSalaries_2026_wk01_main.csv` and `…_full.csv` before 08:40
2. Agent: ingest → dk-salaries main and full → sim 20k (dead at 08:50) → lines → props → dfs main then full
3. If the sim is not done by 08:50, Saturday stays live. No Vercel CLI.

Between those, the LaunchAgent keeps snapshotting. After a new snapshot, `nfl-edge lines --season 2026 --week W` writes edges without a re-sim.

## Injury overrides CSV

`nfl-edge overrides --season S --week W --file path.csv` upserts `raw.player_overrides`.
Columns (header row required):

- `player` — `gsis_id` (`00-…`) or display name. Same name matching as DK salaries (`merge_name` /
  `display_name` + optional `team` + `position`; DST → `{team}_DST`; leftovers in
  `config/dk_aliases.yaml`).
- `status` — `out` | `doubtful` | `questionable` | `active`
- `usage_multiplier` — float, default 1.0. `out` and `doubtful` zero usage in priors regardless.
- `note` — free text
- `team`, `position` — optional disambiguation

Unmatched and ambiguous rows are reported and not written. `questionable` keeps the given
multiplier (default 1.0).

## DK salaries

`nfl-edge dk-salaries --season S --week W --slate main` reads `data/dk/DKSalaries_S_wkWW_main.csv`
(or `--file`). Writes `raw.dk_salaries` (unmatched names kept with null `player_id`, never dropped)
and fills `raw.players.dk_id`. DK `Status` O/OUT and IR → `player_overrides` out (usage 0); D →
doubtful (usage 0); Q → questionable (usage 1.0). Unmatched names and skipped overrides go to
stdout and `output/dk_salaries_{season}_{week}_{slate}.txt`. Leftover names: `config/dk_aliases.yaml`.

## Web

The Next.js app in `web/` reads Supabase from server components. It does not generate verdicts.
The one write is a typed insert into `model.market_props`. Numbers on the Edge board that are
ahead of the last `lines` run come from `proj_games.line_grid` (a lookup, not a new projection).

Player library: `/week/[n]/players/dk/{slate}`. Browser optimizer: `/week/[n]/optimize/dk/{slate}`.
Browser-optimized lineups are **not graded** unless you export the CSV and enter that slate.
The weekly `nfl-edge dfs` 150 (`model.dfs_lineups`) remain the graded set. Both exports stamp
`run_id`, `slate_id`, and `source` (`sim` or `user-optimized`).
Sentences stay on the last `nfl-edge lines` write, which this Mac's LaunchAgent runs after each
snapshot when a week is stale.

- **Vercel project** `nfl-edge`, linked to `github.com/jrakestr/nfl-edge`, **Root Directory = `web`**,
  framework Next.js, Node 22. Previews per branch/PR, production from `main`.
- **Env var**: `DATABASE_URL` only. Value is the Supabase **session pooler** URI (IPv4; the direct
  `db.<ref>.supabase.co` host is IPv6-only and Vercel cannot reach it), set for Production and
  Preview via `vercel env add` (pasted interactively, never in a shell-history line). Locally the
  same URI lives in `web/.env.local`, which `web/.gitignore` excludes.
- **Role**: migration `0006_web_reader_role.sql` creates `web_reader` (login, SELECT on `model.*`
  and `raw.*`, default privileges for future tables, 15 s statement timeout) **without a
  password**. Set it by hand once in the Supabase SQL editor: `alter role web_reader password '…'`
  (letters and digits only, so the URI needs no percent-encoding). The pooler user for a custom
  role is `web_reader.<project_ref>`:
  `postgresql://web_reader.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
- **Freshness**: every page is `force-dynamic`; a new `sim` / `lines` run shows on the next
  request with no redeploy. After a snapshot the board looks up P(cover)/P(over) from
  `line_grid` against the current line. The RunBadge shows `lines as of` / `verdicts as of` in
  the viewer's local timezone; a drift warning means this Mac's `lines` step has not caught up.
  Run `lines` last in the weekly order.
- **Connections**: `postgres.js` pool `max: 3` per instance; preview + prod cold starts stay under
  the free pooler's limit.
- **Deploy**: `cd web && vercel link` (once) → `vercel` for a preview URL → `vercel --prod` only
  after the UI checkpoint in `STATUS.md` is ticked.

## Provenance

Every `sim` run records `git_sha`, `config_hash` and `draws_per_game` in `model.sim_runs`; `lines`
resolves the newest run for the week unless `--run` is given. Edges and verdicts are keyed to the
`raw.market_lines.id` they were computed against, so a line move never overwrites an earlier verdict.
