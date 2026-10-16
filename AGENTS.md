# nfl-edge

Free-data NFL game simulator: one Monte Carlo sim per game drives lines, props,
DFS and showdown, and every run is graded against results and closing lines.

## Commands
- Python (uv): test `uv run pytest` · lint `uv run ruff check`
- Backtest: `uv run nfl-edge backtest`. It passes when every acceptance check prints true.
- Web (`web/`): `npm run lint && npm run typecheck && npm test && npm run build`
- After any DB column add/rename: `npm run types:gen` in `web/`, commit the result
- DB check: `uv run nfl-edge db counts` (never print `.env` or `DATABASE_URL`)

## Every task
- Read docs/purpose.md and docs/architecture.md before planning.
- Do not execute until I say "execute". Plan mode, mode switches and CreatePlan
  are not a go signal.
- Plans use exactly: `## User story`, `## Acceptance criteria`, `## Steps`, `## Unresolved Questions`.
  Format details: [workflow](docs/agents/workflow.md).
- Done = the checks above for the todo's area are green, plus a 3-line summary
  (changed / verified / deferred).
- As-of rule: week W of season S reads only `season < S OR (season = S AND week < W)`.
- Fail closed: if data is missing, ambiguous or partial, stop and name what's
  missing. Never guess, substitute or publish partial output.
- Never print secrets, API keys or request URLs that contain keys.

## Read when touching…
| Area | File |
|---|---|
| Planning, commits, scope | [docs/agents/workflow.md](docs/agents/workflow.md) |
| `sim/`, `priors/` | [docs/agents/model.md](docs/agents/model.md) |
| Tuning, backtests, evaluation | [docs/agents/calibration.md](docs/agents/calibration.md) |
| Ingest, market lines, external projections | [docs/agents/data-sources.md](docs/agents/data-sources.md) |
| Injuries / overrides | [docs/agents/availability.md](docs/agents/availability.md) |
| Grading, CLV | [docs/agents/grading.md](docs/agents/grading.md) |
| DFS, optimizer, DK CSVs | [docs/agents/dfs.md](docs/agents/dfs.md) |
| `web/` | [docs/agents/web.md](docs/agents/web.md) + [docs/design-system.md](docs/design-system.md) |
| Env, DB, deploy, LLMs | [docs/agents/infra.md](docs/agents/infra.md) |
| Ops scripts | [docs/ops.md](docs/ops.md) |

Durable rules live in these files. Weekly checklists, open incidents and
trailing todos live in STATUS.md.

## Plan Mode Directives

### Concision
- Write plans as terse fragments. Sacrifice grammar for concision.
- Bullets over prose. No filler, no restating the request, no narrative paragraphs.
- Keep every plan scannable in one terminal screen where possible.
- Concision applies inside the four headings. It does not add more headings.

### Clarifying Questions
- End every plan with an `## Unresolved Questions` heading.
- One bullet per open question: edge cases, error handling, and unclear requirements.
- Do not proceed to execution until each question is resolved or the user explicitly waives it.
- "Execute" is the go signal. Plan mode, mode switches, and CreatePlan are not.

### Summary Placement
- Steps is the numbered list of concrete execution steps.
- `## Unresolved Questions` is the last heading. Nothing follows it.

### Context Loading
- Read every file you intend to modify before writing the plan.
- Map how the affected components connect. State structural assumptions in the plan.
- Never plan an edit to a file you have not read.
- Also read docs/purpose.md and docs/architecture.md before planning.

### Plan as Contract
- Treat the approved plan as the execution specification. Follow its steps in order.
- If execution reveals the plan is wrong, stop and re-plan. Do not improvise mid-task.
- Use plan mode to surface tradeoffs and validate assumptions before any code is written.
- The plan format is four headings: User story, Acceptance criteria, Steps, Unresolved Questions. Details: docs/agents/workflow.md.
