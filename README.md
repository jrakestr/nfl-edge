# nfl-edge

One game simulator, four views: game lines, player props, DFS classic, and showdown — all derived from the same correlated draws so the outputs can never disagree with each other.

Start with [docs/purpose.md](docs/purpose.md). Design is in [docs/architecture.md](docs/architecture.md); standing constraints in [AGENTS.md](AGENTS.md).

## Stack

- Data: [nflverse](https://nflverse.nflverse.com/) via the `jrakestr/nflreadpy` fork (stats, pbp, schedules with spread/total/moneyline, ffopportunity expected stats, FantasyPros weekly consensus).
- Optimizer / GPP sim: `jrakestr/NFL-DFS-Tools` (vendored as a sibling checkout; we generate its `projections.csv`, `player_ids.csv`, and `config.json`).
- Storage: Supabase / Postgres (`db/migrations`).
- Language: Python 3.11+, managed with `uv`.

## Setup

```bash
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
cp .env.example .env   # fill in Supabase credentials
git clone https://github.com/jrakestr/NFL-DFS-Tools.git ../NFL-DFS-Tools
```

## Weekly cadence

| When | Command |
|---|---|
| Tue | `nfl-edge ingest --week N` then `nfl-edge grade --week N-1` then `nfl-edge sim --week N` then `nfl-edge lines --week N` |
| Wed–Sat | `nfl-edge ingest --lines-only` on a schedule (see [docs/ops.md](docs/ops.md)), `lines` for new snapshots, re-sim on news |
| Sat | `nfl-edge dfs --site dk --slate main --week N` |
| Sun AM | final `ingest` + `sim` + `lines` + `dfs` |

Snapshot cadence (LaunchAgent `com.nfl-edge.lines-only` on this Mac) and the full weekly order: [docs/ops.md](docs/ops.md).

## Layout

```
src/nfl_edge/
  ingest/    nflreadpy -> Postgres (idempotent)
  priors/    team pace/strength, player usage, efficiency
  sim/       drive-level Monte Carlo -> player stat lines -> fantasy points
  outputs/   lines, props, dfs_export, correlations (all read from sim draws)
  market/    free lines from nflverse schedules, manual prop lines, edge calc
  dfs/       wrappers around NFL-DFS-Tools optimizer and GPP simulator
  results/   grading, CLV, calibration
  cli.py     `nfl-edge ingest|sim|lines|props|dfs|grade`
config/      scoring.yaml, sim.yaml, dfs/*.json
db/migrations/
data/        dk/ fd/ salary exports, props/ manual prop lines (gitignored)
```

## Status

Scaffold only. Build order is in `docs/architecture.md` §8.
