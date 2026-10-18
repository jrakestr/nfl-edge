# Vendored NFL-DFS-Tools

Copied from https://github.com/jrakestr/nfl-dfs-tools at `e7591fd` (2026-09-08) on 2026-10-16,
without `.git`, `.DS_Store`, and `readme_images/`. Original authors: Sean (chanzer0) and
Blaine (bjungwirth). The upstream repository has no LICENSE file.

It keeps its own `pyproject.toml` / `uv.lock`; nfl-edge runs it as `uv run src/main.py` with this
directory as the working directory (`src/nfl_edge/dfs/run_optimizer.py`). `NFL_DFS_TOOLS_PATH`
overrides the location. `dk_data/`, `fd_data/`, `output/`, and `config.json` are runtime
staging and stay untracked.

Edit the tool here, not in a separate checkout.

## Local changes

- `src/nfl_gpp_simulator.py` classic player-exposure writer: the header names `Salary` and
  `Fpts`, and the row emits `Proj. Own%`, so header width equals row width (10). This is the
  contract `nfl_edge.dfs.parse.CLASSIC_EXPOSURE_HEADER` reads. The GitHub copy wrote an
  8-field header over 9-field rows and dropped `Avg. Return`.
- `src/nfl_gpp_simulator.py` field generation: `generate_lineups` now runs the same attempts
  and rules through the numba function `_field_lineup` (rules listed above it). The original
  Python version stays as `generate_lineups_py`. On a synthetic 12-game slate (2026-10-16,
  4 CPUs): 6 lineups/s on 4 cores before, 276/s on one core after; a 3000-entry room went
  from 449 s to 28 s per slate. Same field: success rate, mean salary, stack share and
  per-player inclusion agree within sampling noise (`RUN_SLOW=1 uv run pytest tests`).
  Inherited quirks kept on purpose: the projection check receives the relaxing factor, and a
  second stacked TE overwrites the first while its salary stays counted.

Tests: `uv run pytest tests` from this directory (its own env).
- `src/nfl_optimizer.py`, `src/nfl_showdown_optimizer.py`: `max_exposure` from `config.json` is
  enforced. After each lineup, a player who has reached `floor(max_exposure/100 * num_lineups)`
  lineups is locked out (showdown: every slot of that name). Ported 2026-10-17 from the
  uncommitted edits in `~/Development/NFL-DFS-Tools`, which nfl-edge relied on through
  `NFL_DFS_TOOLS_PATH`.
