# Architecture

## Purpose
How the framework is layered, how the agent loop runs, and how the quality gate decides. The
plan that built it is `.plan/001-2026-10-16-agentic-qa-foundation.md`.

## Primary Components

| Component | Where | Responsibility |
|---|---|---|
| Framework | `src/` | Settings, page objects, components, label maps, API clients, schemas, auth, data builders, matchers |
| Fixtures | `tests/fixtures.ts`, `tests/setup/` | Logged-in pages and API contexts per role, run ID, cleanup; the `setup` project logs in once per run |
| Suites | `tests/{ui,api,e2e}/<area>/` | One test per planned case, traced by its `case` annotation |
| Test lifecycle | `.test/` | Master test plan, execution plan, quarantine registry, per-area test and execution plans |
| Quality gate | `tools/gates/` | tsc, ESLint, Prettier, `--list`, Vitest, traceability, integrity, config guard, secretlint → `gate.json`, `coverage-report.md` |
| Dev-loop driver | `tools/dev-loop/` | Runs the stages, checks every hand-off, caps repairs, stops at owner gates, files issues and the PR through `gh` |
| Agents | `.claude/agents/` | orchestrator, test-planner, framework-architect, test-developer (ui, api), code-reviewer |
| Guardrails | `.claude/hooks/`, `.claude/settings.json` | Per-role write lanes, secret files, destructive commands and `gh` for agents, host allowlist |

## Framework layers

```
tests/{ui,api,e2e}/<area>/*.spec.ts      specs: steps and assertions only
        │ uses
tests/fixtures.ts                        operatorPage · employeePage · freshOperatorPage
                                         operatorApi · employeeApi · anonymousApi · cleanup · testCase()
        │ uses
src/ui/pages/*-page.ts ──► src/ui/components/ ──► src/ui/components/mui/   (generic MUI)
        │                    src/ui/labels/*.he.ts (Hebrew names only here)
src/ui/pages/tclock-base-page.ts ──► src/ui/base-page.ts                    (generic)
src/api/clients/*-client.ts ──► src/api/base-client.ts                      (generic)
        │                    src/api/schemas/ (zod) · src/api/routes.ts
src/auth/ (virtual authenticator, passkey store) · src/data/ (run ID, builders, cleanup)
src/assertions/ (toBeAccessDenied, toShowSnackbar) · src/config/ (settings, enum, locale, paths)
```

ESLint holds the layering: specs cannot locate elements, call `request.*`, sleep, contain Hebrew,
skip, or import `tools/` or an LLM SDK.

## The agent loop

Each box is a stage of `tools/dev-loop`. Between boxes the driver checks the hand-off in code (↳).

```
 User story / feature request    a GitHub Issue from the test-request template, or a prompt that the
 + existing repository           orchestrator drafts into one · AGENTS.md, .doc/, .test/, src/
          │ ↳ prompt only: the draft parses as a test request
          │                                                          ✋ Gate 0: owner approves the draft;
          │                                                             the driver files it as the issue
          │ ↳ intake (code): gh issue view --json → .orchestrate/request.json, zod-validated
          ▼
 Orchestrator Agent              orchestrator: scope, stages, dependencies, lane file ownership
                                 → .plan/NNN + .orchestrate/task-graph.json
          │ ↳ task graph matches its schema; every acceptance criterion is assigned to an area
          ▼
 Test Planner                    test-planner (Playwright MCP): .doc/sut/<area>.md, .test/<area>/
          │ ↳ both plans parse; every criterion covered or deferred with a reason (≤2 retries)
          │                                                          ✋ Gate A: owner approves
          ▼
 Framework Architect             framework-architect, only when the task graph needs it
          │ ↳ gate subset: config guard · tsc · ESLint · Vitest
          ▼
 Test Developer                  test-developer-ui ∥ test-developer-api; framework requests → stage 3 (≤2)
          │ ↳ every changed file is inside its lane
          ▼
 Quality gate → Code Reviewer    findings + gate failures → owning agent → gate → review (≤2 rounds)
          │ ↳ no open blocker and the gate is green
          ▼
 Test Runner &                   driver: setup → smoke → area → new cases × newCaseRepeat
 Failure Analyzer                rules: env, flaky · owner triage (phase 1): test bug / product bug
          │ ↳ no untriaged failure; every product bug has a bug draft
          │                                                          ✋ Gate B: owner approves bugs
          ▼
 Bug issues                      driver: secretlint, duplicate check, gh issue create / comment
          │ ↳ area exit criteria met over the cases that are not quarantined
          │                                                          ✋ Gate C: owner approves commit + PR
          ▼
 Validated Pull Request          commit → regression → gh pr create --body-file: CI results, Allure
                                 evidence, coverage, bug issues, review findings, owner approval
```

## Data Flow
- The request lives in a GitHub issue; intake turns it into `.orchestrate/request.json`.
- Agents read files and write their lane; the driver reads their JSON summary only to route
  the loop. Pass or fail comes from the gate and the test run.
- Every run writes `.orchestrate/runs/<run-id>/<step>/` (JUnit, `results.json`, traces) and a
  shared `allure-results/`; the driver adds `summary.json` and `failures.json`.
- Bug drafts and the PR body are rendered by driver code from the issue and PR templates, the
  test plan and the run, redacted, and scanned by secretlint before they leave the machine.

## Auth
TClock: phone + passkey, cookie session. The framework enrolls the QA users once with a CDP
virtual authenticator (`tools/auth/enroll.ts`), logs each role in once per run (`setup`
project), and shares the storage state between the role's page and API context. See the
`passkey-auth` skill and `.doc/sut/auth.md`.

Repository: the hooks enforce per-role write paths through `AGENT_ROLE`; the driver re-checks
each stage's changed files with the same list (`.claude/hooks/lib/role-write-paths.js`).

## External Dependencies
- `dev.tclock.co.il` (the SUT), the only host any code or agent may reach.
- GitHub through the `gh` CLI: issues, pull requests, later Actions. Only the driver and the
  owner call it.
- The Claude Agent SDK (`tools/dev-loop/agents.ts`) and Playwright MCP (test-planner only).

## Operational Concerns
- Retries are 0; new and changed cases run 3 times; flaky cases are quarantined only by the
  owner, against a bug issue.
- Each agent call has a turn cap and a dollar cap; cost and duration per stage go to
  `.orchestrate/trace.json`.
- A stopped run keeps its state in `.orchestrate/loop-state.json`; `--from-stage` resumes it.

## Change Log
- 2026-10-16: foundation: framework, `.test/`, gate, driver, agents (plan 001).
