# .test/ — what we test, and how we run it

`.plan/` says how we build. `.test/` says what we test and how we run it. Every test in
`tests/{ui,api,e2e}` traces to exactly one planned case here, every case traces to a
requirement (or to risk), and every requirement comes from a request issue. The gate
(`tools/gates`) checks all of it on every run.

## Files

| File | Written by | Read by | Content |
|---|---|---|---|
| `master-test-plan.md` | owner | test-planner, code-reviewer | Test strategy: scope, layers, risk ranking, design techniques, environments, entry and exit criteria, IDs |
| `execution-plan.md` | owner | driver, test-planner | Run profiles, tags, parallelism, retry and quarantine policy, run artifacts |
| `quarantine.md` | **owner only** | gate | Quarantined cases, each linked to its bug issue |
| `<area>/test-plan.md` | test-planner | test-developer, code-reviewer, gate | Requirements table + Test Cases table |
| `<area>/execution-plan.md` | test-planner | driver (front matter), owner | Area run settings, data setup, serial groups, exit criteria |

No agent role may write the first three; a hook enforces it.

## Lifecycle of an area

1. **Request.** A GitHub issue from the `test-request` template: user story, numbered
   acceptance criteria, area, roles. The owner writes it, or approves the orchestrator's
   draft at Gate 0.
2. **Plan.** The test planner explores the area and writes `<area>/test-plan.md` and
   `<area>/execution-plan.md`. Every criterion becomes a requirement row, covered by cases
   or deferred with a reason. The owner approves at Gate A, and the plan becomes `Status: active`.
3. **Automate.** The test developers implement each `planned` case as one test carrying
   `testCase('<CASE-ID>')`. The gate fails a test without a case, a case without a test, and
   a requirement without a case.
4. **Run.** The driver runs smoke, then the area, with new cases repeated
   `newCaseRepeat` times. Results land in `.orchestrate/runs/<run-id>/`.
5. **Report.** `npm run gate` computes `.orchestrate/coverage-report.md`: requirement →
   cases → tests → last result. Automation status and results are never typed by hand.

## IDs

- Requirement: `<AREA>-AC-NN`, e.g. `AUTH-AC-01`. Copied from the request's numbered criteria.
- Case: `<AREA>-<LAYER>-NNN`, layer `UI`, `API` or `E2E`, e.g. `AUTH-UI-001`.
- `<AREA>` is the area slug in upper case: `employee-report` → `EMPLOYEE-REPORT`.
- IDs are never reused. A dropped case keeps its row with `Automation: deferred`.

## Test plan tables

**Requirements:** `ID | Requirement | Source | Status`. Status is `covered`, or
`deferred: <reason>` (owner approval at Gate A).

**Test Cases:** `ID | Title | Covers | Layer | Type | Priority | Preconditions | Steps | Expected | Automation`.

- `Covers`: requirement IDs, comma-separated, or `risk` for a case added from risk analysis.
- `Layer`: `ui`, `api` or `e2e`, and it must match the ID.
- `Type`: `positive`, `negative` or `edge`. `Priority`: `P1`, `P2` or `P3`.
- `Steps` and `Expected`: separate lines with `<br>`. A bug report copies them verbatim.
- `Automation`: intent only — `planned`, `manual` or `deferred`.
