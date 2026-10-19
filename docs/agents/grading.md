# Grading and CLV

- Grade each game against the newest `sim_runs` row that predates kickoff. Neutral
  sites use `gameday` 00:00 ET as the cutoff. The board reads `model.results`
  and does not re-select the run.
- Grade every completed week not yet graded, or report the gap. Never grade a week
  with null results; name the missing games.
- CLV reads `market_lines` snapshots / `schedules.total_line`, never
  `schedules.total`. Displayed CLV = first bet-able snapshot (earliest
  `predated_kickoff` row with edge > 0) to close.
- `/grading` buckets every `predated_kickoff` last-snapshot line (home for
  spread/ML, over for total), not just edge>0 picks.
- Grading cards follow the selected week and show pick accuracy, margin within 7
  and beat the spread.
- Weekly sim lineups are the graded DFS set. Browser-optimized lineups are not
  graded unless exported and entered.
- Lineup actuals are `model.slate_actuals` (one row per player-week). `actual_fpts`
  is written only when every slot's game is final. The live job does not write it.
  A mapped player with no row in a final game is 0. An unmapped salary row blocks
  the lineup.
- Prune draw parquet only after the week is graded (or by an age fallback). Keep
  `sim_runs` rows and null out `draws_path`.
- `current-week` = the weekend being played (used by week-rebuild).
  `upcoming-week` = next REG week with games left, by America/Phoenix date
  (used by week-open).
