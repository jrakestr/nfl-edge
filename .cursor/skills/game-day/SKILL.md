---
name: game-day
description: Runs the nfl-edge weekly pipeline end to end (salaries, odds, inactives, re-sim, lines, DFS lineups) without stopping between steps. Use when the user says game day, check inactives, pre-kickoff, before TNF/SNF/MNF, build lineups for the week, re-sim, or complains about running weekly steps one by one.
disable-model-invocation: true
---

# Game day

Run every step in one turn. Do not stop to report between steps. Stop only on the fail-closed cases in AGENTS.md. Run on the Mac with `DATABASE_URL` unset. `W` = week, `S` = 2026.

## Pick the mode

| User says | Mode |
|---|---|
| "check inactives", "before kickoff", within 2h of a kickoff | **Inactives** |
| "build the week", "lineups", Tue–Sat with no kickoff soon | **Week build** |
| "recap" | **Recap** (end of file) |

## Step 0: Preflight (every mode)

```bash
dig +short api.the-odds-api.com www.draftkings.com
```

`146.112.61.106` = Cisco Umbrella block on the managed network. The code is fine. Error shows as `SSLV3_ALERT_HANDSHAKE_FAILURE`. Use the fallbacks below; tell the user to switch networks only if both the direct and fallback paths fail.

## Week build

1. Salaries, fetched and loaded into `raw.dk_salaries` (`dk-fetch` alone only writes files):
   `uv run nfl-edge phase salaries --week W`
   Fails at DNS: `uv run nfl-edge storage pull-salaries --week W`, then rerun the phase.
2. Odds: `uv run nfl-edge ingest odds-api --markets h2h,spreads,totals --regions us`
   Fails: `gh workflow run refresh.yml -f week=W`; lines use the newest stored pull.
3. Injuries: `uv run nfl-edge ingest fantasypros-status --season S --week W`
4. Sim: `uv run nfl-edge sim --season S --week W --draws 20000`, then `uv run nfl-edge storage push-draws --week W`
5. Lines: `uv run nfl-edge lines --season S --week W`
6. DFS: every slate that has not locked (Thursday: `full` + the TNF showdown; never wait for Saturday):
   `uv run nfl-edge dfs --season S --week W --site dk --slate <slate> --lineups 150`
7. Confirm in the DB: every built slate has 150 `model.dfs_lineups` rows on the new `run_id`.

## Inactives

Inactives post 90 min before kickoff; FantasyPros marks them OUT ~10 min later. Run at **kickoff minus 75 min**.

Phoenix = ET − 3 during daylight time, ET − 2 during standard time (first Sunday of November to the second Sunday of March).

| Kickoff ET | T−75 Phoenix (daylight) | T−75 Phoenix (standard) |
|---|---|---|
| Thu/Mon 8:15 | 16:00 | 17:00 |
| Sun 1:00 | 08:45 | 09:45 |
| Sun 4:05 | 11:50 | 12:50 |
| Sun 4:25 | 12:10 | 13:10 |
| Sun 8:20 | 16:05 | 17:05 |

1. `uv run nfl-edge ingest fantasypros-status --season S --week W`
2. `uv run nfl-edge change-check --week W`
3. No `re-sim suggested` on a game not yet started: done. Report "no change, current lineups stand".
4. `re-sim suggested`: sim, push-draws, lines, then DFS for every unlocked slate containing that game (Week build steps 4–7). Must finish before the earliest lock.
5. Output the upload paths: `data/dfs/<run_id>/dk/<slate>/dk_upload_<slate_id>_<run8>_sim.csv`

## Known failures (diagnose, don't report blind)

| Symptom | Cause | Action |
|---|---|---|
| SSL handshake failure on odds/DK | Umbrella DNS | Fallbacks above |
| Web says "<slate> has no salaries loaded" | Files fetched, never loaded | `phase salaries --week W` |
| `espn-league` ValueError: team names ESPN no longer uses | Owner renamed team | Rename in `fantasy.loc_teams` + `loc_weekly_scores` (`team`, `opp_team`) in one transaction, rerun |
| Unmatched DK names | Missing alias | Propose rows for `config/dk_aliases.yaml`; add after user OK |
| Mac rebuild ran before Sunday inactives | Fixed 08:40 plist vs. standard time | Run the Inactives mode at 09:45 |

## Output

Return only:

```
Mode: <mode> · week W · run <run8>
| Step | Result |
|---|---|
| Salaries | N slates loaded |
| Odds | ok / fallback |
| Inactives | changes: <players> / none |
| Sim | <run8>, <games> games |
| DFS | <slate>: 150/150 legal, ... |
Upload: <paths>
Next: <next timed action, Phoenix clock>
```

## Recap

Follow the `conversation-recap` skill. Its weekly-steps table: each pipeline step, what runs it today (Refresh 20:00 Phoenix daily, Mac rebuild Sat 20:00 / Sun 08:40, grade Tue 09:00), and Yes/No for whether it ran without a hand step this week.
