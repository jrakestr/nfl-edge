-- Mark whether the grading run existed before that game's kickoff.
-- False = fallback (backtest runs created after the game) or an explicit --run after kickoff.
-- Calibration and the board filter this by default so hindsight rows stay out of the curve.

alter table model.results
  add column if not exists predated_kickoff boolean not null default false;
