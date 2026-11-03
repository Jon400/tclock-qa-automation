# auth — Test plan

Status: active
Area: auth
Request: `.plan/001-2026-10-16-agentic-qa-foundation.md` (step 10, the foundation smoke cases)
Last updated: 2026-10-16

The reference area: the smoke criteria that prove the framework end to end on the UI and
API layers. The session-expiry request (backlog 1) extends this plan.

Techniques: role × action (operator allowed, anonymous denied; the employee case is deferred
because no QA Employee will be provisioned), state
transition (logged in → logged out). Exploration notes: `.doc/sut/auth.md`.

## Requirements

| ID | Requirement | Source | Status |
|---|---|---|---|
| AUTH-AC-01 | An operator logged in with a passkey reaches the app and sees the company-management navigation | .plan/001 step 10 | covered |
| AUTH-AC-02 | An employee (SUT role `user`) cannot open company-management screens | .plan/001 step 10 | deferred: no QA Employee will be provisioned (owner, 2026-10-16) |
| AUTH-AC-03 | Logging out ends the session in the browser and on the server | .plan/001 step 10 | covered |
| AUTH-AC-04 | The session endpoint reports the role that belongs to the caller's session | .plan/001 step 10 | covered |
| AUTH-AC-05 | Company-management endpoints reject calls without a session | .plan/001 step 10 | covered |

## Test Cases

| ID | Title | Covers | Layer | Type | Priority | Preconditions | Steps | Expected | Automation |
|---|---|---|---|---|---|---|---|---|---|
| AUTH-UI-001 | The operator is logged in and sees the company-management navbar | AUTH-AC-01 | ui | positive | P1 | QA Operator enrolled; the setup project saved the operator session | 1. Open /home as the operator<br>2. Look at the navbar | The welcome heading is visible<br>The navbar shows the company, users and attendance-management menus | planned |
| AUTH-UI-002 | The employee is denied a company-management route | AUTH-AC-02 | ui | negative | P1 | QA Employee enrolled; the setup project saved the employee session | 1. Open /home as the employee<br>2. Open /users/list | The navbar has no company menu<br>/users/list shows the access-denied warning | deferred |
| AUTH-UI-003 | Logout ends the session in the browser and on the server | AUTH-AC-03 | ui | positive | P1 | A fresh operator session, separate from the shared one | 1. Log in as the operator in a new browser context<br>2. Log out from the navbar<br>3. Open /home<br>4. Call GET /web/auth/session with the same cookies | The login form is shown<br>The session call returns 401 | planned |
| AUTH-API-001 | The session endpoint reports the operator role | AUTH-AC-04 | api | positive | P1 | The setup project saved the operator session | 1. Call GET /web/auth/session with the operator cookies | 200, and the body matches the session schema<br>user.db_role is "operator" | planned |
| AUTH-API-002 | A company-management endpoint rejects an unauthenticated call | AUTH-AC-05 | api | negative | P1 | None | 1. Call GET /web/users/provision-options without cookies | 401 | planned |

## Risks and open points

- The backend may enforce the passkey signature counter. The framework saves the counter
  after every login and serialises logins per role; the spike confirms whether it matters.
- AUTH-UI-003 must not use the shared operator session: logging out would end it for every
  other test in the run. It logs in on its own (`freshOperatorPage`).
