# Tuning and evaluation

- Gate: no new refinements until `uv run nfl-edge backtest` prints every acceptance
  check true. Thresholds live in `src/nfl_edge/results/calibration.py`; do not
  restate or change them here. Falling back to a simpler or previous setting is allowed.
- Never change a sim parameter on less than one full graded week.
- Never tune against posted prop lines. Calibrate out of sample against realized
  outcomes (e.g. usage `k` against realized share).
- Beyond noise = on one full graded season slice, resample games (not draws). The
  paired difference vs. current priors is beyond noise when its 95% bootstrap CI
  excludes 0. One week never qualifies.
- Headline metric is Flat ROI until there are 10 graded weeks. A single week's
  Kelly ROI or Brier score is not evidence of beating the market.
- A sound model lands ~40–60% over on posted lines. Systematic star
  underprojection is a model-miss warning, not an under lean. Do not ship Sunday
  DFS/prop leans from such a run.
- If a priors correctness fix worsens backtest MAE beyond noise, stop before
  rebuilding the live week.
- Usage vector: do not re-run the `k` sweep until both xfails pass
  (`test_wr1_renorm_delta_independent_of_room_size`,
  `test_many_games_negligible_carries_get_negligible_share`). Never loosen their
  bounds. If both pass and k=0 still wins, the vector target is biased; find the
  cause rather than accepting k=0.
- Calibration monotone against the close is a season-long target, not a build gate.
