---
name: writing-test-plans
description: Write or extend an area's test plan and execution plan in .test/<area>/ from a test request. Use when turning acceptance criteria into requirement rows and test cases, choosing layers and priorities, adding risk-based cases, deferring a criterion, or setting an area's run profile and exit criteria.
---

# Writing Test Plans

`.test/<area>/test-plan.md` holds two tables the gate parses. The gate fails on a wrong header,
a bad ID, a duplicate, a requirement no case covers, or a planned case with no test. Copy the
shape of `.test/auth/test-plan.md`.

## The file

```
# <area> — Test plan

Status: draft
Area: <area>
Request: #<issue>
Last updated: YYYY-MM-DD

<one paragraph: what this area is, which techniques you used, link to .doc/sut/<area>.md>

## Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|

## Test Cases

| ID | Title | Covers | Layer | Type | Priority | Preconditions | Steps | Expected | Automation |
|---|---|---|---|---|---|---|---|---|---|

## Risks and open points
```

## Requirements

- One row per request criterion. `Requirement` is the criterion's text; `Source` is
  `#<issue> AC <n>` (`#local AC <n>` for a local request). The driver matches that exactly.
- IDs `<AREA>-AC-NN`, continuing after the area's highest one. Never renumber.
- `Status`: `covered`, or `deferred: <reason>` when the case cannot be automated now (no way
  to reach the state, a missing environment capability). The owner approves each deferral at
  Gate A. Never defer because a case is hard to write.
- Never add, reword or drop a criterion: they are the owner's. Your own ideas become `risk` cases.

## Test cases

- IDs `<AREA>-<LAYER>-NNN` (`AUTH-UI-004`, `AUTH-API-003`), continuing per layer.
- `Covers`: the requirement IDs it proves, or `risk`.
- For each requirement: a positive case, the negative cases (wrong role, missing input,
  anonymous), and edge cases on its boundaries.
- Design techniques: equivalence partitioning and boundary values for inputs; state
  transitions for lifecycles (draft → submitted → approved → locked); role × action for
  permissions (operator allowed, employee and anonymous denied).
- `Layer`: the cheapest layer that proves the behaviour. Rules and permissions → `api`; what
  the user sees and can do → `ui`; a flow across roles or layers → `e2e`. Do not repeat an
  API check through the UI.
- `Type`: `positive` | `negative` | `edge`. `Priority`: `P1` (smoke, money, access control,
  data loss), `P2` (main flows), `P3` (cosmetic, rare).
- `Preconditions`: roles and data, never real names or phone numbers.
- `Steps` and `Expected`: numbered, separated by `<br>`, one observable result per line. The
  bug report copies them verbatim, so write them for a reader who never saw the app.
- `Automation`: `planned` (the developers implement it now), `manual`, or `deferred`.

## Execution plan

`.test/<area>/execution-plan.md` starts with the front matter the driver reads:

```yaml
---
area: <area>
grep: "@<area>"
newCaseRepeat: 3
serial: false        # true when every case changes company-wide state
dependsOnProfiles: [smoke]
exit:
  p1PassRate: 100
  overallPassRate: 100
  maxNewFlaky: 0
  untriagedFailures: 0
---
```

Then three short sections: `Data setup` (what the cases create, through which builders and
clients, and how cleanup deactivates it), `Serial groups` (which cases carry `@serial` and
why), and `Area exit criteria` in words.

## Checklist before you finish
- Every request criterion has a row, and every `covered` row has at least one case.
- Every case has a valid ID, layer, type, priority and automation value.
- Existing IDs and rows are unchanged.
- The execution plan's `area` and `grep` match the folder name.
