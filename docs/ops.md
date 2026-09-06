# Operations: line snapshots and the weekly run order

Documented, not scheduled. Nothing in this repo installs a cron; when one is created it should run
exactly the commands below and nothing else.

## Line snapshots

```
nfl-edge ingest --season 2026 --lines-only
```

- Pulls the nflverse schedule for the whole season and `insert ... on conflict do nothing` into
  `raw.market_lines` (unique on game + every quoted value). An unchanged pull is a no-op, so
  over-scheduling costs one HTTP request and nothing else. Games not yet in `raw.schedules` are
  added; existing schedule rows are not touched.
- Suggested cadence (America/New_York):
  - Tue–Sat: every 4 hours
  - Sun: hourly 06:00–13:00
  - 60 minutes before each Thursday and Monday kickoff
- Constraint to keep in mind: nflverse schedule lines are not a live odds feed. Snapshot resolution
  is bounded by upstream refresh, not by how often the cron runs. During Week 1 count distinct
  snapshots per game (`select game_id, count(*) from raw.market_lines where game_id like '2026_01_%'
  group by 1`) and record the observed cadence in `STATUS.md` before treating the last snapshot as
  the closing line for Step 7 grading.
- Example crontab, for reference only:

  ```
  # Tue-Sat every 4h
  0 */4 * * 2-6  cd ~/Development/nfl-edge && .venv/bin/nfl-edge ingest --season 2026 --lines-only
  # Sun hourly 06:00-13:00
  0 6-13 * * 0   cd ~/Development/nfl-edge && .venv/bin/nfl-edge ingest --season 2026 --lines-only
  ```

## Weekly order

| When | Command | Notes |
|---|---|---|
| Tue | `nfl-edge ingest --season 2026 --week W` | Full pull. Before nflverse publishes a season, stats / opportunity / snap counts are skipped with a message and rosters come from the preseason roster file. |
| Tue | `nfl-edge grade --season 2026 --week W-1` | Grades every run of the week against scores and the last pre-kickoff snapshot (schedules fallback when none). CLV needs pre-kickoff snapshots, so the cron must be running. |
| Tue/Wed | `nfl-edge sim --season 2026 --week W --draws 20000` | One run per slate; every output reads its parquet. |
| Tue/Wed | `nfl-edge lines --season 2026 --week W` | Computes edges for every snapshot the run has not seen, writes `model.verdicts`, prints the verdicts and edge table. `--json` for the UI contract; `--recompute` to rebuild a run's edges and verdicts. |
| Wed–Sat | `nfl-edge ingest --season 2026 --lines-only` (cron) then `nfl-edge lines ...` | New snapshots get edges without a re-sim. Re-sim only on news (injury report Fri/Sat). |
| Sat | `nfl-edge dfs --site dk --slate main --week W` | Step 6; not built yet. |
| Sun AM | final `ingest --week W`, `sim`, `lines`, `dfs` | |

## Provenance

Every `sim` run records `git_sha`, `config_hash` and `draws_per_game` in `model.sim_runs`; `lines`
resolves the newest run for the week unless `--run` is given. Edges and verdicts are keyed to the
`raw.market_lines.id` they were computed against, so a line move never overwrites an earlier verdict.
