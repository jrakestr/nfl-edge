# Data sources and ingest

## Policy
- Sim and priors use free data only: nflverse via nflreadpy, free schedule lines,
  manual prop lines. Paid feeds (Odds API, FantasyPros) are for display, edges and
  grading only.
- First pull of any nflverse dataset: print the actual column names before writing
  ingest code. If a planned column is missing, stop and report.
- Do not add `TEAM_NAMES` or `config/dk_aliases.yaml` mappings without my OK.

## nflverse schedules
- `total` = actual home+away score; `total_line` = betting O/U.
- Game identity is the row. Scores and `result`/`overtime` arrive later and must
  overwrite null; `lines-only` must not block that.

## Odds API (`nfl-edge ingest odds-api`, Python CLI only)
- Key never goes in `web/.env.local`. Never print it or the request URL
  (`apiKey` is a query parameter).
- Writes `raw.market_lines` (`source='odds_api'`): one row per book/market/side;
  bookmaker in the dedupe key; `captured_at` = bookmaker `last_update`; one
  `fetched_at` per pull.
- Fail closed on unmapped names. Skip unmatched events unless none match.
- `ops/lines-only.sh` and `ops/week-rebuild.sh` pull `h2h,spreads,totals`
  (3 credits). One explicit pull, never a poll.
- `model.market_lines_latest`: DraftKings when kickoff ≥
  `model.line_reference.effective_from` and that row has spread and total;
  otherwise nflverse. Games before that date use nflverse everywhere.
- The manual market CSV is optional and used for edges only.

## Props
- Board props come from `model.fair_props` (sim medians rounded to the nearest
  half), written by `nfl-edge lines`.
- Break-even ("Needs") comes from the posted price, not the de-vigged probability.
- Never invent a missing opposite price to de-vig a one-sided prop.
- Fair-line calibration is graded separately from market-priced edges.

## FantasyPros (Python CLI only)
- `FANTASY_PROS_API_KEY` in `.env` only. Pulls append to
  `raw.fantasypros_snapshots` keyed by `fetched_at`.

## Promoting external projections (NFLGameSim, RTS, FantasyPros…)
They stay display-only benchmarks until all four hold:
1. An as-of snapshot table keyed by `fetched_at`.
2. An out-of-sample backtest over a full graded season slice that beats current
   priors on realized outcomes beyond noise, never tuned against posted lines.
3. The blend lives in `priors/` or `sim/`, shrunk toward our priors with the
   weight fit out of sample. Never a raw pass-through.
4. My explicit OK, per source and per channel.
Exception: availability enters only via `raw.player_overrides` (availability.md).
