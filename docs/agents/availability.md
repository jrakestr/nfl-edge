# Availability (`raw.player_overrides`)

- Week-keyed. Every ingest is scoped by its note prefix: it writes and clears only
  its own rows and never touches manual or claims-promote rows.
- A positive signal never clears an OUT.
- DK Status O/D/Q writes overrides. Pass `--status-from` from the widest slate
  (usually `full`). A blank DK Status clears only DK-sourced rows.
- FantasyPros injury rows (prefix `fp `) write only out/doubtful.
- UI and DFS drop anyone whose current override is OUT, IR, or D set after the
  run's `created_at`. The Fpts floor is not an injury filter.
