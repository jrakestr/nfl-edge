# NFL Edge — Repo Architecture (2026-27 season)

**Status:** Design v1, 2026-09-05
**Decisions:** One pipeline repo; forks as dependencies; Python-first; Supabase/Postgres storage; all four outputs (classic DFS, showdown, game lines, props) in scope and required to be internally consistent.

## 1. Core principle: one simulation, four views

Every output must come from the same source of truth. The architecture enforces this by making a **game simulator** the center of the system. Nothing downstream is allowed to project a number independently; it can only read draws from the sim.

```
                    ┌──────────────────────┐
  nflverse data ──► │  Team & player       │
  ffopportunity ──► │  priors (usage,      │
  depth charts  ──► │  efficiency, pace)   │
  weather/rest  ──► └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │  GAME SIMULATOR      │  N=20k draws per game
                    │  drives → plays →    │  correlated by construction
                    │  stat lines → FPTS   │
                    └──────────┬───────────┘
          ┌────────────┬───────┴───────┬─────────────┐
          ▼            ▼               ▼             ▼
   Game lines      Player props    DFS classic    Showdown
   (score dist)    (stat dists)    (FPTS + corr)  (FPTS + corr)
          │            │               │             │
          └────────────┴───────┬───────┴─────────────┘
                               ▼
                    Market comparison + edge + results log
```

Because a team's points, its players' yards/TDs, and the opponent's game script all come from the same draw, the correlations you described fall out automatically: if the sim's cumulative fantasy points favor one team, the same draws produce the spread and total that reflect it, and the props for both rosters move together. No reconciliation step is needed because there is nothing to reconcile.

## 2. Repository layout

```
nfl-edge/
├── pyproject.toml            # uv-managed; deps pin your forks by git URL
├── README.md
├── .env.example              # SUPABASE_URL, SUPABASE_KEY, etc.
├── config/
│   ├── scoring.yaml          # DK / FD scoring rules
│   ├── sim.yaml              # draws, pace, variance params
│   └── dfs/                  # NFL-DFS-Tools config.json per site/slate type
├── src/nfl_edge/
│   ├── ingest/               # nflreadpy pulls → Postgres (idempotent, weekly)
│   │   ├── schedules.py      # incl. spread_line, total_line, moneylines
│   │   ├── stats.py          # player/team weekly stats, pbp aggregates
│   │   ├── opportunity.py    # load_ff_opportunity (expected stats)
│   │   ├── consensus.py      # load_ff_rankings("week") — FantasyPros ECR
│   │   ├── context.py        # depth charts, snap counts, rosters, injuries*
│   │   └── dk_salaries.py    # DK/FD player export CSV (manual or scraper)
│   ├── priors/               # turn history into per-game inputs
│   │   ├── team.py           # pace, pass rate, EPA/play, off/def strength
│   │   ├── usage.py          # target/carry share, red-zone share, snap %
│   │   └── efficiency.py     # yards/target, TD rate, shrunk toward ffopp _exp
│   ├── sim/                  # THE core
│   │   ├── game.py           # drive-level Monte Carlo; returns draws table
│   │   ├── players.py        # allocate team plays to players by usage priors
│   │   ├── scoring.py        # stat lines → DK/FD/PPR fantasy points
│   │   └── slate.py          # run every game on a slate; persist draws
│   ├── outputs/
│   │   ├── lines.py          # P(cover), P(over), fair spread/total/ML from draws
│   │   ├── props.py          # player stat quantiles, P(over line) for any line
│   │   ├── dfs_export.py     # projections.csv: Name,Position,Team,Salary,Fpts,Own%,StdDev
│   │   └── correlations.py   # player-player corr matrix from draws → custom_correlations
│   ├── market/
│   │   ├── lines_nflverse.py # free opening/current lines from schedules
│   │   ├── props_manual.py   # optional: paste-in / scraped prop lines (no paid API)
│   │   └── edge.py           # model vs market; Kelly-fraction sizing
│   ├── dfs/
│   │   ├── run_optimizer.py  # wraps NFL-DFS-Tools optimizer
│   │   └── run_sim.py        # wraps NFL-DFS-Tools GPP simulator
│   ├── results/
│   │   ├── grade.py          # after games: actual vs projected, CLV, ROI
│   │   └── calibration.py    # is P(over)=0.6 hitting 60%? per market type
│   └── cli.py                # `nfl-edge ingest|sim|lines|props|dfs|grade --week N`
├── db/
│   └── migrations/           # Supabase SQL migrations
├── notebooks/                # backtests, calibration plots
└── tests/
```

### Fork roles

| Fork | Role in nfl-edge | How consumed |
|---|---|---|
| `nflreadpy` | All data ingest | `pip install git+https://github.com/jrakestr/nflreadpy` |
| `NFL-DFS-Tools` | Optimizer + GPP sim | Dependency; we generate its `projections.csv`, `player_ids.csv`, `config.json` |
| `ffopportunity` | Reference for the expected-points model | Outputs consumed via `nflreadpy.load_ff_opportunity()`; no R runtime |
| `ffanalytics` | Reference for projection aggregation logic | Not a runtime dependency in v1; consensus comes from `load_ff_rankings` |
| `nflverse-data` | Understanding release schedule / schemas | Not a code dependency |

## 3. Data model (Supabase)

Keep raw and derived separate so backtests can rerun from raw.

**Raw (mirrors nflverse, keyed by season/week):** `schedules`, `player_stats_weekly`, `team_stats_weekly`, `ff_opportunity_weekly`, `ff_rankings_weekly`, `depth_charts`, `snap_counts`, `rosters_weekly`, `dk_salaries` (site, slate_id, player, salary, roster_position).

**Derived (keyed by run_id):**
- `sim_runs` — run_id, season, week, created_at, config hash, git sha
- `sim_game_draws` — run_id, game_id, draw_no, home_pts, away_pts (20k rows/game; or store quantiles + a parquet blob)
- `sim_player_draws` — run_id, player_id, draw_no, pass_yds, rush_yds, rec, rec_yds, tds…, fpts_dk, fpts_fd (large; consider parquet in Supabase Storage with a summary table)
- `proj_players` — run_id, player_id, mean/median/p10/p90 per stat, fpts mean/std, projected own%
- `proj_games` — run_id, game_id, fair_spread, fair_total, p_home_cover_at_market, p_over_at_market
- `market_lines` — game_id, captured_at, source, spread, total, ml (snapshot each ingest → gives you line movement for free)
- `market_props` — player_id, captured_at, stat, line, over_odds, under_odds, source
- `edges` — run_id, market_type, ref_id, model_prob, market_prob, edge, kelly
- `dfs_lineups` — run_id, site, slate_id, lineup json, proj fpts, sim win%, roi
- `results` — after grading: actual stat/score, hit/miss, CLV

## 4. The simulator, concretely

Version 1 keeps it simple and correlated rather than fancy:

1. **Team level per game.** Draw plays for each team from pace priors (adjusted by projected game script, since a trailing team throws more). Draw pass rate. Draw points per drive from an offense-vs-defense strength matchup, with a home/rest/weather adjustment. Sum to a score. This alone yields a spread and total distribution.
2. **Player level, conditioned on the team draw.** Allocate the team's drawn pass attempts, targets, and carries to players by usage priors (Dirichlet draw around the prior, so shares vary run to run). Apply efficiency draws (yards/target, TD rate) shrunk toward ffopportunity's `_exp` values, which already encode down/distance/field-position context.
3. **Score it.** Convert stat lines to DK and FD points. Compute mean, std, and quantiles per player; compute the full player-player correlation matrix from the draws.

Consistency checks that should run automatically each week: sum of player fantasy TDs ≈ team TDs in the same draw; sim fair total within a sane band of the market total (a big gap is a bug or a real edge, and the grading log will tell you which over time); QB passing yards ≈ sum of receiving yards.

## 5. How each output is produced

**Game lines.** From `sim_game_draws`: fair spread = median margin; fair total = median total; P(cover) and P(over) at the market number are just draw proportions. Compare to `market_lines` (from nflverse schedules, free, snapshotted every ingest so you keep open → current movement).

**Player props.** From `sim_player_draws`: for any line you enter (from a book's site, a screenshot, a scraped page), P(over) is the proportion of draws above it. No paid API; `props_manual.py` accepts a CSV of lines you paste in for the games you care about. Since props are conditioned on the same team draws, a prop edge and a total edge on the same game are consistent by construction.

**DFS classic.** `dfs_export.py` writes NFL-DFS-Tools' `projections.csv` (Fpts = mean, StdDev from draws) and `correlations.py` writes `custom_correlations` in its config from the sim's actual correlation matrix instead of the hard-coded defaults. Ownership projection is v1 heuristic (salary, projection, consensus rank) until you have a season of contest data.

**Showdown.** Same draws, captain multiplier applied in scoring, routed to `nfl_showdown_optimizer.py` / simulator.

## 6. Weekly operating cadence

| When | Command | What happens |
|---|---|---|
| Tue AM | `nfl-edge ingest --week N` | Stats from last week, updated schedules/lines, rosters, depth charts. Grade last week. |
| Tue | `nfl-edge sim --week N` | Priors → sim → draws persisted; first lines/props/DFS views |
| Wed–Sat | `nfl-edge ingest` (lines only) + re-sim on news | Line movement snapshots; injury-driven usage prior updates |
| Sat | `nfl-edge dfs --site dk --slate main` | Export projections, run optimizer + GPP sim, write lineups |
| Sun AM | Final ingest + sim | Inactives; final lineups |
| Tue | `nfl-edge grade --week N-1` | Results, CLV, calibration tables |

Automate the Tue/Sat/Sun steps with a scheduled task once the CLI is stable.

## 7. Known gaps and how to fill them

- **Injuries:** nflverse's injury feed ended after 2024. v1 uses depth charts + weekly rosters + manual overrides in a `player_overrides.yaml`. Later: scrape official team reports.
- **Ownership:** no free source. Start heuristic, then fit a model on your own contest exports.
- **Prop lines:** manual entry in v1. Keep the `market_props` schema so a scraper or paid feed can drop in later without touching the model.
- **DK salaries:** DK's CSV export per slate, dropped into `data/dk/`; or the existing draftkings-nfl-stats-scraper skill.

## 8. Build order

1. Repo scaffold, `uv` env, Supabase migrations for raw tables, `ingest` for schedules/stats/opportunity/rankings. (Backfill 2020–2025 for backtesting.)
2. `priors/` — team pace/strength and player usage from the raw tables.
3. `sim/game.py` + `sim/players.py` + scoring; validate against 2025 with the consistency checks and a calibration plot for spreads/totals.
4. `outputs/lines.py` and `market/edge.py` — first real product: model vs market on Week N sides/totals.
4b. Web app (`web/`, Next.js + shadcn on Vercel, spec in `docs/design-system.md`): app shell and the Edge board reading `model.verdicts`, `model.edges_latest`, `model.proj_games`, `model.sim_checks`. This is how the outputs get looked at; it runs in parallel with 5–7 and every later step adds a screen to it (props in 6, grading in 7).
5. `outputs/dfs_export.py` + optimizer wrapper — Week N lineups.
6. Props view and showdown routing.
7. `results/grade.py` — close the loop before Week 3 so the season's data accumulates.
