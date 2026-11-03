# TClock: system under test

Black-box notes from the served client and from exploration, 2026-10-11 to 2026-10-16. Per-area
details live in `.doc/sut/<area>.md`. The served source may be read to understand behaviour; it
is never copied into this repository.

## The product
A Hebrew/RTL time-and-attendance and payroll back office. Employees report attendance and
absences; operators manage the company's users, branches, work-report locations, policies and
monthly reports, and export payroll hours. Built with React and MUI.

## Environment
- `https://dev.tclock.co.il`, a live Vite dev server behind Cloudflare. It may restart or change
  without notice: a 5xx, a challenge page or a connection error is an environment problem.
- We work in a sandbox company only the owner uses, as two QA users: `QA Operator` and
  `QA Employee`. The owner's own account is never used by automation.
- Entities cannot be deleted, only deactivated. Everything a run creates is named `qa-<runId>-`.

## Roles and access

| SUT role (`db_role`) | Our name | Can use |
|---|---|---|
| `admin` | — (out of scope) | platform administration, every company |
| `operator` | operator | company management + their own attendance |
| `user` | employee | their own attendance and reports |

Access mode (`access_mode`): `full` or `reports_only`. Screens fall into three groups: admin
only, company management (admin and operator), and user (everyone logged in). An employee who
opens a company-management route sees an access-denied warning; the API answers 401 without a
session.

## Login and sessions
- Phone number + passkey. `POST /web/auth/start` answers `enroll` (first login) or `login`, the
  browser signs a WebAuthn challenge, `POST /web/auth/verify` sets the session cookie. No
  password, OTP or SMS step.
- Same-origin cookie session: 15 minutes idle, 5 hours absolute, reported in
  `X-Web-Session-*` headers and by `GET /web/auth/session`.
- An expired session in the middle of work raises a re-authentication dialog.
- Details: `.doc/sut/auth.md`.

## UI facts that shape the framework
- No `data-testid`s: locators use role and accessible name, in Hebrew.
- The language and colour mode live in `localStorage` (`tclock-language`, `tclock-color-mode`);
  the framework pins `he` and `light`.
- MUI widgets throughout: data grids, date and month pickers, dialogs, snackbars.

## Areas
The risk ranking and the order of the backlog are in `.test/master-test-plan.md`. Area slugs:
`auth`, `employee-report`, `payroll-hours`, `user`, `branch`, `work-report-location`,
`absence`, `company-policy`, `punch-clock-configuration`, `daily-attendance`,
`period-summary`, `access`, `public-page`.
