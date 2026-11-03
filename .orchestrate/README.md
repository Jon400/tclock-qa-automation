# .orchestrate/

Every file in this directory except this README is **generated** by the dev loop, the quality
gate or a test run, and none of it is source of truth. All of it is gitignored
(`.orchestrate/*`, with this README negated). Some of it is sensitive (traces, bug drafts):
it never leaves the owner's machine except through the driver's redacted, secretlinted
issue and PR bodies.

| Path | Written by | Content |
|---|---|---|
| `request-draft.md` | orchestrator (stage 0) | the request drafted from a prompt, before Gate 0 |
| `request.json` | driver (intake) | the validated test request |
| `task-graph.json` | orchestrator (stage 1) | tasks, agents, dependencies, lanes |
| `test-plan-summary.json` | driver | the test planner's deferrals and ambiguities, for Gate A |
| `explore/` | test-planner, `auth:enroll` | exploration output and the passkey spike summary |
| `framework-architect-report.md` | framework-architect | new interfaces and how to use them |
| `test-developer-*-*.md` | test developers | optional lane notes |
| `review-report.md`, `review-findings.json` | code-reviewer, driver | review findings and their resolutions |
| `gate.json`, `coverage-report.md` | `npm run gate` | the gate verdict per check; requirement → case → test → result |
| `runs/<run-id>/` | Playwright, driver | per step: `junit.xml`, `results.json`, traces; `allure-results/`, `allure-report/`, `summary.json`, `failures.json` |
| `bugs/` | driver | bug drafts (`<case-id>.md`), Gate B decisions, filed issues |
| `comments/`, `pr-body.md` | driver | bodies for `gh issue comment` and `gh pr create` |
| `loop-state.json` | driver | where a run is, for `--from-stage` |
| `trace.json` | driver | cost, turns and duration per agent call |
