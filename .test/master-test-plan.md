# Master test plan — TClock

Status: active
Owner: Jon400
Last updated: 2026-10-16

The test strategy for every area. Area test plans in `.test/<area>/` apply it; the
code-reviewer checks specs against it.

## Scope

**System under test:** TClock's web back office at `https://dev.tclock.co.il`, a Hebrew/RTL
time-and-attendance app with passkey login. See `.doc/sut-overview.md`.

**In scope:** the back office as an operator (company management) and as an employee (role
`user`, self-service), through the UI and the `/web/*` endpoints the UI calls.

**Out of scope:** platform-admin flows (beyond checking an operator is denied), the mobile
app, load and security testing, accessibility, visual regression, i18n parity, and
browsers other than Chromium (the virtual authenticator needs CDP).

## Test layers

Put every check on the cheapest layer that can prove it.

| Layer | Folder | Proves | Use when |
|---|---|---|---|
| API | `tests/api/` | A `/web/*` endpoint's status, body shape (zod) and rules | The rule lives on the server: validation, permissions, state transitions, calculations |
| UI | `tests/ui/` | What a role sees and can do in one screen | The behaviour is in the browser: navigation, forms, messages, role-dependent UI |
| E2E | `tests/e2e/` | A flow across roles or layers | One role acts and another sees the effect, or the UI action must change server state |
| Unit | `tests/unit/` | Framework, gate, driver and hook logic | Code in `src/`, `tools/`, `.claude/hooks/` (Vitest, no browser) |

Rules of thumb: set data up through API clients, not the UI. One case, one intent. A UI
case asserts what the user sees; an API case asserts status plus body.

## Area risk ranking

Higher risk is tested first and deepest (P1 cases, more negative and edge cases).

| Rank | Area | Why |
|---|---|---|
| 1 | `auth` | Passkey login, sessions (15 min idle, 5 h absolute), role boundaries: everything depends on it |
| 2 | `employee-report` | The monthly report lifecycle (edit, submit, review, approve, lock, return) drives payroll |
| 3 | `payroll-hours` | Money: hour splits and the Excel export |
| 4 | `user` | Provisioning, roles, access mode; only deactivation, no delete |
| 5 | `branch` | Codes (availability, suggestion) and policies |
| 6 | `work-report-location` | Address lookup, map, radius |
| 7 | `absence` | Hours, half day, full day, date ranges |
| 8 | `company-policy`, `punch-clock-configuration` | Company-wide state: serial only |
| 9 | `daily-attendance`, `period-summary` | Read-mostly reports |
| 10 | `access` | Role × route and API matrix |
| 11 | `public-page` | Home, privacy, support |

## Design techniques

Every area test plan names the techniques it used.

- **Equivalence partitioning:** one case per class of input (valid phone, too short,
  letters), not one per value.
- **Boundary values:** at, just inside and just outside each limit (9 and 10 digits; the
  last day of a month; a radius of 0).
- **State transitions:** for lifecycles (report: draft → submitted → approved → locked,
  and returned → draft), one case per allowed transition and one per forbidden one.
- **Role × action:** for every action, the allowed roles succeed and the others are denied,
  in the UI and in the API.
- **Error guessing from risk:** duplicates, concurrent edits, expired sessions, Hebrew and
  RTL text, empty lists. These cases cover `risk`.

## Priority

| Priority | Meaning | Exit criterion |
|---|---|---|
| P1 | A failure blocks core use or corrupts data | 100% pass |
| P2 | Important behaviour with a workaround | Counted in the overall pass rate |
| P3 | Minor or cosmetic | Counted in the overall pass rate |

## Environments

| Environment | URL | Use |
|---|---|---|
| dev | `https://dev.tclock.co.il` | The only one. A live Vite dev server that may restart without notice |

Two long-lived QA users in the owner's sandbox company: `QA Operator` (role `operator`) and
`QA Employee` (role `user`), each with a passkey enrolled by `npm run auth:enroll`. Test data
is created per run with the `qa-<runId>-` prefix and deactivated afterwards.

## Entry criteria (per run)

- The gate passes (`npm run gate`).
- The dev health check passes and the setup project logs every role in.
- The smoke profile passes. Red smoke means the environment is broken: the run stops.

## Exit criteria (per area)

Set in the area's `execution-plan.md` front matter. Defaults:
- 100% of P1 cases pass, and 100% of all cases pass, counting only cases not quarantined.
- No new flaky case (`maxNewFlaky: 0`).
- No untriaged failure: every failure is a test bug (fixed), an env issue (rerun), flaky
  (quarantine proposal) or a product bug (bug issue + quarantine).

## IDs

Requirement `<AREA>-AC-NN`, case `<AREA>-<LAYER>-NNN`. See `.test/README.md`.
