
# nfl-edge rules

Read docs/purpose.md before planning any change. docs/architecture.md is the design.

- One simulation per game; every output (lines, props, DFS, showdown) reads from the same draws. Never compute a projection outside sim/.
- No paid data sources. nflverse via nflreadpy, free schedule lines, manual prop lines only.
- Full draws go to parquet under data/draws/; Postgres holds summaries keyed by run_id.
- Invariants before features. The TD-sum and QB-yards checks must hold in every draw; do not add refinements until the current backtest passes.
- Priors must use only rows with season < S or week < W. ffopportunity _exp for week W never enters week W priors.
- Do not widen a plan's scope. Refinements go to the trailing todo, not the current one.
- Every sim output must carry a run_id so it can be graded against results and closing lines.

# How I work in this repo

- Tests before code for sim/ and scoring: the invariant tests are the spec. Make them fail, then make them pass.
- One commit per plan todo, message prefixed with the todo id (e.g. `ingest-players: ...`).
- A todo is done when `pytest` passes, `ruff check` is clean, and the summary is three lines: what changed, what was verified, what was deferred.
- Do not edit the plan file. If scope must change, stop and report; the decision is mine.
- Start a new conversation at each checkpoint. Carry state through the plan file and STATUS.md, not chat history.
- Never print or paste .env contents or DATABASE_URL. Verify the DB connection with `nfl-edge db counts`.
