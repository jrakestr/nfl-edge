# Operations: line snapshots and the weekly run order

Scheduled on this Mac as LaunchAgent `com.nfl-edge.lines-only`. `com.vix.cron` is not running
here, so a crontab would never fire. The agent runs `ops/lines-only.sh`, which calls
`nfl-edge ingest --season 2026 --lines-only` and then immediately
`nfl-edge lines --season 2026 --week 1` (newest sim run for the week; all games) with
`DATABASE_URL` unset so `.env` (Supabase) is used. Edges and verdicts follow every snapshot.
Template: `ops/com.nfl-edge.lines-only.plist`. Log: `output/cron-lines.log` (both steps).

## Cadence

- Through Sunday 2026-09-13 23:59 PT: every 30 minutes (`StartInterval` 1800).
- After that cutoff: the wrapper no-ops except on even Pacific hours (2 h). `ops-refine` if a
  later TNF/MNF needs a dedicated extra fire.
- nflverse schedule lines are not a live odds feed. Snapshot resolution is bounded by upstream
  refresh. During Week 1 count distinct snapshots per game and record the observed cadence in
  `STATUS.md` before treating the last snapshot as the closing line.

```
nfl-edge ingest --season 2026 --lines-only
nfl-edge lines --season 2026 --week 1
```

Ingest pulls the nflverse schedule for the whole season and `insert ... on conflict do nothing`
into `raw.market_lines`. An unchanged pull is a no-op. Games not yet in `raw.schedules` are
added; existing schedule rows are not touched. `lines` then writes edges and verdicts against
the newest complete sim run for week 1 so the board stays current without a re-sim.

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

## Weekly runbook

Replace `W` with the NFL week. Run in this order, on this Mac, with `DATABASE_URL` unset.

Tuesday

1. `nfl-edge ingest --season 2026 --week W`
2. `nfl-edge grade --season 2026 --week W-1`  (skip on Week 1 until the previous week has scores)
3. `nfl-edge sim --season 2026 --week W --draws 20000`
4. `nfl-edge lines --season 2026 --week W`

Wednesday / Friday (injury report)

5. `nfl-edge overrides --season 2026 --week W --file data/props/overrides_W.csv`
6. Re-sim and re-lines only if an override changed a starter or a usage share: steps 3 then 4.

Saturday

7. `nfl-edge dk-salaries --season 2026 --week W --slate main`
8. `nfl-edge dfs --season 2026 --week W --site dk --slate main --lineups 150 --field 20000`

Sunday AM (final)

9. `nfl-edge ingest --season 2026 --week W`
10. `nfl-edge sim --season 2026 --week W --draws 20000`
11. `nfl-edge lines --season 2026 --week W`
12. `nfl-edge dk-salaries --season 2026 --week W --slate main`
13. `nfl-edge dfs --season 2026 --week W --site dk --slate main --lineups 150 --field 20000`

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

Sunday 2026-09-13 ~09:00 MST (before the early-window lock)

1. Re-export DK Main and Full → `data/dk/DKSalaries_2026_wk01_main.csv` and `…_full.csv`
2. `nfl-edge ingest --season 2026 --week 1`
3. `nfl-edge dk-salaries --season 2026 --week 1 --slate main`
4. `nfl-edge dk-salaries --season 2026 --week 1 --slate full`
5. `nfl-edge sim --season 2026 --week 1 --draws 20000 --note sun-final`
6. `nfl-edge lines --season 2026 --week 1`
7. `nfl-edge props --season 2026 --week 1 --file data/props/props_2026_wk01.csv`
8. `nfl-edge dfs --season 2026 --week 1 --site dk --slate main --lineups 150 --field 20000`
9. `nfl-edge dfs --season 2026 --week 1 --site dk --slate full --lineups 150 --field 20000`
10. `cd web && vercel` (preview, not `--prod`)

Between those, the LaunchAgent snapshots then runs `nfl-edge lines --season 2026 --week 1` so
edges and verdicts follow every snapshot. A fresh Sunday sim still needs step 11 because that
is a new `run_id`; after that, the agent keeps the board current. Do not re-run `lines` by hand
after a snapshot.

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

The Next.js app in `web/` reads Supabase directly from server components; it never writes.

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
  request with no redeploy. The LaunchAgent runs `ingest --lines-only` then `nfl-edge lines`, so
  `model.verdicts_latest` and `model.edges_latest` track each game's newest `raw.market_lines`
  snapshot. Per-game "moved since sim" is the line-move signal; the board does not prompt to
  re-run `lines` by hand. After a new `sim`, run `lines` once in the weekly order (the agent
  covers later snapshots).
- **Connections**: `postgres.js` pool `max: 3` per instance; preview + prod cold starts stay under
  the free pooler's limit.
- **Deploy**: `cd web && vercel link` (once) → `vercel` for a preview URL → `vercel --prod` only
  after the UI checkpoint in `STATUS.md` is ticked.

## Provenance

Every `sim` run records `git_sha`, `config_hash` and `draws_per_game` in `model.sim_runs`; `lines`
resolves the newest run for the week unless `--run` is given. Edges and verdicts are keyed to the
`raw.market_lines.id` they were computed against, so a line move never overwrites an earlier verdict.
