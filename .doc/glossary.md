# Glossary

## Purpose
Canonical terms for code, routes, docs and plans. Add a new shared term here before using it
broadly, and never introduce a second word for a concept that already has one. Kept in line with
`.claude/rules/naming.md`.

## TClock terms

| Term | Meaning | Not |
|---|---|---|
| company | The customer organisation in TClock; everything else belongs to one | org, organization, tenant |
| operator | A user with the SUT role `operator`: manages a company | manager, admin |
| employee | Our name for a user with the SUT role `user`: reports their own attendance | worker, member |
| `user` | The SUT's role value for an employee, used as TClock sends it (`db_role: "user"`) | — |
| admin | The platform-wide SUT role; out of scope | — |
| access mode | `full` or `reports_only`, per user | permission level |
| branch | A company site with a code and policies | location, site |
| work-report location | A geofenced place (address, `lat` / `lng`, radius) where attendance may be reported | geolocation |
| geo | Short form for anything location-based: `geo`, `lat`, `lng` | localization |
| employee report | An employee's monthly attendance report: edited, submitted, reviewed, approved, locked or returned | timesheet |
| payroll hours | The operator's per-employee hour breakdown and its Excel export | salary |
| absence | Reported time off: hours, half day, full day or a date range | leave |
| session | The cookie session after login: 15 minutes idle, 5 hours absolute | token |
| passkey | The WebAuthn credential a user logs in with | password |
| deactivate | The only way to remove an entity in TClock; nothing is deleted | delete |

## Testing terms

| Term | Meaning |
|---|---|
| area | A slice of the product with its own test folder, `.test/` folder, tag and branch, in kebab-case singular: `auth`, `employee-report` |
| request | A GitHub issue in the `test-request` format (user story, numbered acceptance criteria, area, roles) that starts one dev-loop run |
| acceptance criterion | One numbered line of a request; it becomes a requirement |
| requirement | A row in an area's test plan, `<AREA>-AC-NN`, with its source (`#<issue> AC <n>`) |
| case | A planned test, `<AREA>-<LAYER>-NNN`, in an area's test plan; exactly one test implements it |
| test | A Playwright test carrying one `case` annotation via `testCase()` |
| layer | `ui`, `api` or `e2e`; `unit` for framework and tooling tests |
| run | One execution of the suite, `.orchestrate/runs/<run-id>/`; its run ID prefixes every entity it creates |
| run ID | `YYMMDD-HHMMSS-xxxx` (UTC) |
| QA user | `QA Operator` or `QA Employee`: the only accounts automation logs in as |
| `qa-` entity | An entity a run created, named `qa-<runId>-<label>`; the only kind a test may change |
| quarantine | An owner-approved exclusion of a failing case, listed in `.test/quarantine.md` with its bug issue and tagged `@quarantine` |
| lane | The paths one agent role may write |
| gate (quality) | `tools/gates`: the checks whose exit code accepts or rejects agent work |
| gate (owner) | Gate 0, A, B or C: where the driver waits for the owner's approval |
| framework request | A test developer's request for a missing fixture, page object or client, answered by the framework-architect |
| bug draft | A product-bug report rendered by the driver into `.orchestrate/bugs/<case-id>.md`, filed only after Gate B |
