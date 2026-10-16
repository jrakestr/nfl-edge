# Simulation and priors

## Invariants
- One simulation per game. Lines, props, DFS and showdown all read the same draws.
- Projections come only from `sim/`; `priors/` produces inputs.
- Every sim output carries a `run_id`. Full draws → parquet in `data/draws/`;
  summaries → Postgres keyed by `run_id`.
- TD-sum and QB-yards checks must hold in every draw.
- Fail the sim if any game lacks player draws. Never publish a partial slate.
- Market spread/total never enter `sim/game.py` or `sim/players.py`. `slate.py`
  loads them only for P(cover)/P(over) summaries.
- Nothing in `sim/` or `priors/` reads external projections before promotion
  (see data-sources.md).

## Priors
- As-of rule (root). ffopportunity `_exp` for week W never enters week W priors.
- Prior-season week 18 is excluded from history in all channels.
- Recency weights apply to the prior rate.
- Shrinkage `n_eff` = Kish `(Σw)² / Σw²` on the same weights as the weighted mean:
  game-level `w` for usage, team strength and QB start share; touch-level `n·w` for
  efficiency and QB YPA. Never raw counts or `Σw`.
- No information means no adjustment: when the evidence is zero, the factor is 1.0.

## QB channel
- Replacement-QB target = the incumbent's team YPA, falling back to the league
  baseline when attempts are zero. Do not tune `shrink_k_qb_att` to fix a replacement QB.
- A clamp at 1.0 for low attempts is inflate-only; use a league-replacement baseline.
- Lamb / Watson-lookback / small-sample-QB are one root cause (the single-season
  week-1 window), not three bugs. Multi-season recency lookback is its own item.
