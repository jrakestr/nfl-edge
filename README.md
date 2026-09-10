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

Ordered command list and LaunchAgent install: [docs/ops.md](docs/ops.md). Snapshot job: every 30 min through Sunday 2026-09-13 night, every 2 h after.

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
web/         Next.js app (Edge board, prop detail); reads model.* read-only
```

## Web app

```
cd web && npm install && npm run dev      # http://localhost:3000 -> /week/<newest week with a run>
npm run lint && npm run typecheck && npm test && npm run build
```

`package.json` for the app is in `web/`. From the repo root, `npm run lint` / `test` / `build` forward there. `npx vercel` must be run from `web/` (this VM is `/workspace`, not `~/Development/nfl-edge`).

`web/.env.local` holds `DATABASE_URL` = the Supabase **session pooler** URI (IPv4; the direct host is IPv6-only and Vercel cannot reach it). Never committed. On Vercel the project's Root Directory is `web` and the same variable is set in the project's environment. Spec: [docs/design-system.md](docs/design-system.md).

## Status

Scaffold only. Build order is in `docs/architecture.md` §8.
