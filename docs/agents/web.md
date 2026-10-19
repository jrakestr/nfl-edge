# Web app (`web/`)

## Data boundary
- Read-only, except: `model.market_props` insert, `model.usage_claims` insert,
  `model.llm_calls` logging, the one-row promote `usage_claims` →
  `raw.player_overrides`, and /workflow: GitHub `workflow_dispatch` of phase.yml and DK CSV
  upload to the private `salary-files` bucket. Both sit behind `WORKFLOW_PASSWORD`; the
  dispatch token and service key are server env only. No long job runs in a request.
- Research Lab (`/research`): inserts and deletes rows of `model.research_metrics` (the user's
  display-only metrics). Fields come from `model.research_fields`, built in Python by
  `nfl-edge research build --week W` from weeks before W; the page scores them in TS and never
  recomputes priors. The optional Jev rubric column is display-only, off unless
  `TYPESAFE` (or `TYPESAFE_API_KEY`) is set. Loading the page never calls Jev. A run is explicit:
  estimate first, refused over $0.50, capped at 100 players, results cached in
  `model.research_jev_scores` (migration 0045) and shown only on `/research`.
- Python-generated copy (verdicts, PropCallout) is persisted in Postgres. Never
  reimplement those generators in TypeScript.
- Never recompute priors in TS. "Why" and diagnostics read `model.run_team_inputs`
  and `model.sim_checks`. Never use `schedules.*_qb_id` as the run's starter.
- Gemini may emit constraints and structured claims, never projection numbers.
  Claims are paste-only; the server never fetches `source_url`.
- The Edge board reads `model.verdicts_latest` / `model.edges_latest`, never
  verdict payload `edges[]`.

## Week and runs
- Current week = lowest REG week with a null `result`, then newest run, then
  default. Not `max(week)`.
- A week with no complete run shows schedule + market lines with an em dash in
  model columns. Partial runs stay hidden.
- Displayed spread/total use `mean_*`; P(cover)/P(over) use the median.

## Routing and components
- WeekBoard is a server component (thin GameOpenShell + `?game=`). Filter via
  `data-game-id`; never serialize verdicts to the client.
- `games=` = strip multi-select (full game_ids), preserved across page and slate
  hops via `GamesSelectionProvider`, cleared on week change. `game=` = drawer,
  not preserved. Players uses the strip as its game filter.
- Client modules must not import SQL modules (they pull `postgres`/fs/net/tls).
  Keep display helpers in SQL-free files (`check-display.ts`, `team-input.ts`).

## Copy and labels
- Never show snake_case field names. Label lookback as "most attempts in
  lookback", not "former starter". Label at-run and as-of-latest market clocks
  separately.

## Visual rules
Follow docs/design-system.md. Key rules:
- Dual theme via tokens (`data-theme` / `nfl-edge.theme`); no color forks per component.
- Type tokens: `t-caption`/`t-colhead` 14, `t-body` 15, `t-sentence` 16,
  `t-title` 22, `t-tile` 32. Nothing below 14px; grow height/padding instead of
  shrinking type. `t-body` needs `h-7`; `h-6` only with `t-caption`. `tnum` steps
  weight, not size.
- Model values use foreground, market values use `--line`; only the difference
  is colored. Separate numbers with a space or hairline, never middots.
