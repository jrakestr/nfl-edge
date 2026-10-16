# Vendored NFL-DFS-Tools

Copied from https://github.com/jrakestr/nfl-dfs-tools at `e7591fd` (2026-09-08) on 2026-10-16,
without `.git`, `.DS_Store`, and `readme_images/`. Original authors: Sean (chanzer0) and
Blaine (bjungwirth). The upstream repository has no LICENSE file.

It keeps its own `pyproject.toml` / `uv.lock`; nfl-edge runs it as `uv run src/main.py` with this
directory as the working directory (`src/nfl_edge/dfs/run_optimizer.py`). `NFL_DFS_TOOLS_PATH`
overrides the location. `dk_data/`, `fd_data/`, `output/`, and `config.json` are runtime
staging and stay untracked.

Edit the tool here, not in a separate checkout.
