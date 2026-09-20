## User story

As someone who decides the contest before I build, I want Cash, Single Entry, and Mass GPP as named construction profiles — one config both the Python pipeline and the browser optimizer read — so each method writes its own lineups and they never mix on the Lineups page.

## Acceptance criteria

### Scenario 1: Cash uses floor from a named percentile

* **Given** a DK classic (or showdown) slate and `config/dfs/constructions.json` with Cash `floor_percentile`, `randomness` 0, min salary 49,700, lineups 1–3, `max_exposure` 100, `num_uniques` 1, no stack and no ownership term
* **When** I select Cash in the browser optimizer or run `nfl-edge dfs --construction cash`
* **Then** the solver objective is the sum of each player's `stat_summary` percentile (p25), NFL-DFS-Tools receives that value as `Fpts` (it has no floor objective), persisted `proj_fpts` is re-scored from the mean, and Win % / ROI are not treated as cash evidence

### Scenario 2: Single Entry is one deliberate tournament lineup

* **Given** the Single Entry profile: mean plus named `ceiling_weight` on (p90 − mean) minus named `ownership_penalty` on `proj_own`, randomness 0, QB + at least one same-team WR/TE, one bring-back, min salary 49,200, default 1 lineup and at most 5, each later lineup differs from the prior by at least 2 players
* **When** I select Single Entry or run `--construction single`
* **Then** those weights and stack rules load into the solver and into `config.json`, there is no exposure cap and no `num_uniques` across a mass set, and I can export any one lineup as a one-row DK CSV

### Scenario 3: Mass GPP stays today's recipe and constructions do not mix

* **Given** Mass GPP (randomness 25, `max_exposure` 40, `num_uniques` 3, min salary 49,200, 150 lineups, existing stack rules) and a week-2 slate with unplayed games
* **When** the scheduled rebuild runs (default `--construction mass`) and I also run `cash` and `single` for that slate
* **Then** each set is stored with `construction` on `model.dfs_lineups`, the Lineups page filters by method and does not show Pick one, and the report names the cash and single lineups with projection, floor, ceiling, summed projected ownership, and stack

## Steps

1. `construction-config`: `config/dfs/constructions.json` (classic + showdown; named `floor_percentile`, `ceiling_weight`, `ownership_penalty`) and loaders for Python and the web. Add p25 to `sim/slate.py` `_summarize`. Tests first.
2. `construction-web`: Construction selector on Optimize; profile → `SolveControls`; solver objectives (floor / mean+ceiling−ownership / jittered mean); `p25`/`p90` on `OptPlayer` from the player query. Locks, excludes, required stacks unchanged. Tokens, no snake_case, nothing under 14px. `npm run lint && typecheck && test && build`.
3. `construction-pipeline`: `nfl-edge dfs --construction cash|single|mass` (default mass). Overlay the profile on `config.json` and lineup count. NFL-DFS-Tools cannot optimize floor or ceiling — export the construction-adjusted value as `Fpts`, then re-score persisted `proj_fpts` from the mean. Migration `construction` on `model.dfs_lineups` (existing rows `mass`), `npm run types:gen`. Persist delete is construction-scoped so sets never overwrite each other.
4. `construction-lineups`: Filter Lineups by construction; label the method. Remove `PickOne` / `pick-one.ts`. Keep one-row DK export on every lineup card.
5. `construction-build`: For every week-2 slate with unplayed games, run `--construction single` and `--construction cash` (mass already there). Backfill p25 from that run's draws if the live `stat_summary` lacks it. Report each slate's single and cash lineup: projection, floor, ceiling, summed projected ownership, stack.
