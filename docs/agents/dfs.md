# DFS

## Slates and files
- DK salary files come from the DK lobby via `nfl-edge dk-fetch` (no login) into
  gitignored `data/dk/` and private Storage. Never ask for a manual CSV export.
  DFS is slate-scoped (classic:
  main/early/full/afternoon/turbo/primetime; showdown separate). Each slate has its
  own DK IDs; upload CSVs must use that slate's IDs.
- Unknown slate key: show an empty state naming the expected DK CSV. Never
  substitute Main.
- `ops/week-rebuild.sh` runs `dk-fetch` (else `storage pull-salaries`) and builds every
  slate that comes back.
- Player joins go through `raw.players` + `raw.dk_player_crosswalk`
  (LAR→LA, JAC→JAX, WSH→WAS).
- Upload line 1 is the site header (`QB,RB,RB,WR,WR,WR,TE,FLEX,DST` or the
  showdown CPT header), never a comment.
- Filename: `dk_upload_<slate_id>_<run_id[:8]>_<sim|user-optimized>.csv`;
  CLI path `data/dfs/<run_id>/<site>/<slate>/`.

## Optimizer
- Web optimizer point source (`pts`): DK pts (default), NFLGameSim, FantasyPros,
  Adjusted, or Yours. DK pts keeps the construction objective (cash = p25, single =
  mean + ceiling − ownership). Any other source uses that number as the points:
  cash does not substitute the sim floor; single entry still subtracts ownership
  and does not add the sim ceiling. A player with no usable number for the chosen
  source is out of the pool. Defenses are not in the miss table, so a defense with
  a blank source stays on DK pts. A lock in that state stops the solve.
- Choose the classic mode (Cash / Single Entry / Mass GPP) before the build. One
  shared config for Python and web: `config/dfs/dk_classic.json` (`num_uniques`,
  max exposure). Never ship `num_uniques=1` with no cap.
- Locks and required-stack players are exempt from exposure caps. A lock means
  in the lineup, not a specific slot (showdown: `c_i + f_i = 1`).
- Never silently drop a forced pick.
- GPP field size must exceed lineups entered, or fail closed.
- `model.dfs_exposure` columns: `own_ours` / `own_field_proj` / `own_field_sim`.
  Hide the panel when `own_field_sim` is null.
- Chalk is judged per player, not per bucket: six 2026 Main weeks showed chalk at any
  salary tier or position busting at the same ~50% rate as 5–15% owned players. The
  `CHALK` tag (`research/chalk.py`) fires only on a player's own repeated busts at
  ≥ 15% field ownership. It is numeric and never a Jev question; it sits beside the
  Jev verdict and never changes it.
- `raw.dk_contests.source`: `standings` (full CSV) or `api` (gamecenter pull for purged
  exports; top-1% columns null). Anything reading `top1_score`/`top1_rate` handles null.
- Every lineup is re-audited by `dfs/validate.py` from `raw.dk_salaries` (never the
  optimizer CSV) before persist/upload: roster shape, slot position, cap recomputed
  from slate salaries, ≥2 games (classic), CPT row + both teams (showdown), no
  duplicate player, every DK ID on the slate. A failure stops the run; nothing is
  written. A new DK rule gets a validator clause and a test. Audit a file by hand:
  `nfl-edge dfs-validate --file <dk_upload csv>`.
- `max_from_game` in `constructions.json` (classic only, default `null`) caps players
  from one game via NFL-DFS-Tools `matchup_limits`, keyed by the raw DK `AWAY@HOME`
  token. Set a number only after a backtest. Keep `web/src/lib/optimize/constructions.json`
  identical (a web test checks it).
