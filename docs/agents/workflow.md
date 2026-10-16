# Workflow

## Plan files
Exactly three `##` headings, in order: User story, Acceptance criteria, Steps.
Missing or reordered sections make the plan invalid.

- Acceptance criteria: one `### Scenario N: <Title>` per testable scenario,
  with **Given** / **When** / **Then** bullets. Never put them inside the story or steps.
- Steps: each step is a todo with a kebab-case id (e.g. `ingest-players`).
- UI scenarios are component or unit tests (`npm test`). The visual pass is the
  user's and stays outside the plan.

## Execution
- Tests first for `sim/` and scoring: write the failing invariant test, then make it pass.
- One commit per todo, message prefixed `<todo-id>: `.
- Never edit the plan file. Nice-to-have refinements go to the trailing todo in
  STATUS.md. If a change blocks the acceptance criteria, stop and report; I decide.
- Checkpoint = end of each todo. Start a fresh conversation or subagent there.
  Carry state only through the plan file and STATUS.md.
- Do not drive the browser to verify UI; I check it.
- Do not re-send a plan I already have.
