# Purpose

I'm building a system for the 2026–27 NFL season that produces betting and DFS projections from free, open-source data, where every projection is consistent with every other one.

## The problem I'm solving

Most projection tools treat game lines, player props, and DFS lineups as separate products with separate models. That produces contradictions: a lineup that stacks a team's passing game while the same tool's spread has that team as a heavy underdog running the clock out; a prop that says a receiver clears 80 yards while the total implies a defensive slog. Those contradictions are where the losses hide.

## What I want

One simulation of each game. Every output is a read of the same draws.

- If the simulated fantasy points for one team exceed the other's, the spread and total from the same draws already reflect that. No reconciliation step.
- If a player's yardage prop looks like an edge, the game total and the DFS stack that includes him are derived from the same scenarios, so they agree by construction.
- Correlations between players (QB to WR1, RB vs. opposing DST) come from the sim, not a hard-coded table.

## How one simulation produces correlated outputs

The sim is drive-level and strictly top-down; correlation is a consequence of structure, not a table I maintain.

Each draw starts at the team: drives and points per drive given the matchup (offense strength, defense strength, home field, rest, weather) produce the score, and the score's TDs are split into passing and rushing. Only then does the draw move to players. The team's passing attempts are allocated to receivers by a Dirichlet share draw, and the team's passing TDs by a multinomial split; carries and rushing TDs the same way for rushers. The quarterback's line is never sampled on its own. His completions, yards, and TDs are the sum of what his receivers caught in that draw.

So QB and WR1 are correlated because the QB's yards *are* the WR1's yards plus everyone else's. A running back and the opposing defense are negatively correlated because the defense's points-allowed bracket is that back's team's score in the same draw. Game total and player props agree because both are the same draws read at different levels. Two invariants are checked in every draw and fail the run if violated: player TDs sum to team TDs, and QB passing yards equal the sum of receiving yards.

The full model is in `docs/architecture.md` §4.

## Outputs, in priority order

1. Game lines: fair spread, total, and moneyline vs. the market, with tracked edge and closing-line value.
2. DFS classic lineups for DraftKings and FanDuel, with projections, standard deviations, and correlations fed to an optimizer and GPP simulator.
3. Player props: P(over) for any line I enter, from the same player distributions.
4. Showdown lineups from the same draws.

## Constraints I'm holding to

- No paid data. nflverse for stats and free market lines (opening spread, total, moneyline ship with the schedule). Prop lines are entered manually.
- Open source building blocks: nflreadpy, ffopportunity expected stats, FantasyPros consensus as a baseline, NFL-DFS-Tools for optimization.
- Python-first. Postgres for summaries, parquet for the full draws.
- Every output must trace back to a `run_id` so I can grade it after the games and know whether the model or the market was right.

## How I'll know it works

Before Week 1 usage: a 2025 backtest where the sim's fair spread and total track the closing line (MAE within ~3 and ~4 points), calibration buckets are monotone, and the internal invariants (player TDs sum to team TDs, QB yards equal receiving yards) hold in every draw.

During the season: a graded log of every line, prop, and lineup against actual results and closing lines. The system earns trust by being right often enough, not by being complicated.

## What this is not

Not a sportsbook scraper, not a paid-data aggregator, not a black box. If I can't explain why the sim likes a side, I don't bet it.
