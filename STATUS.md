# Status

Plan: `~/.cursor/plans/nfl_edge_steps_1-3_*.plan.md` (Steps 1–3 of docs/architecture.md §8)

## Done
- Scaffold (d401be7): schedules ingest, migrations 0001–0002, configs, CLI shell
- docs/purpose.md, AGENTS.md, .cursor/rules

## In progress
- env-migrate: uv env, `nfl-edge db migrate|counts`, migration 0003 authored (raw.players, raw.team_game_agg, model.sim_checks, ff_rankings re-key, market_lines dedupe index), pytest `network` marker

## Blocked / needs a decision
- Migration 0003 not yet applied: Postgres rejects the password in .env (host reachable). Reset DB password to alphanumeric and update .env.

## Checkpoints
- [ ] A — backfill 2020–2025 loaded, `nfl-edge db counts` printed
- [ ] B — `nfl-edge priors --season 2025 --week 10` plausible
- [ ] Backtest 2025 report at 5k draws; invariants 100%; spread MAE ≤ 3, total MAE ≤ 4
