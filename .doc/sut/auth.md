# auth — exploration notes

Explored: 2026-10-16, by the passkey spike (`npm run auth:enroll -- --role operator`) and the
first live runs of the setup project and `AUTH-UI-001`. The QA Employee is not provisioned yet.

## Routes

| Route | Who can open it | What it shows |
|---|---|---|
| `/login` | anyone | the phone form; then the passkey prompt |
| `/home` | any logged-in role | the welcome heading and the navbar |
| `/users/list` | operator (and admin) | the company's users; an employee sees the access-denied warning |

## Controls (Hebrew accessible names)
The names the framework uses live in `src/ui/labels/` (`login.he.ts`, `navbar.he.ts`,
`home.he.ts`, `access-denied.he.ts`, `re-auth-dialog.he.ts`).

## /web/* calls

Observed by the spike for the QA Operator (paths and statuses only):

| Action | Method | Path | Status | Notes |
|---|---|---|---|---|
| Open `/login` without a session | GET | `/web/auth/session` | 401 | called twice on load |
| Submit the phone, first time | POST | `/web/auth/start` | 200 | `next: "enroll"` |
| Create the passkey | POST | `/web/auth/verify` | 200 | sets the session; `X-Web-Session-*` headers present |
| Submit the phone, enrolled user, fresh browser | POST | `/web/auth/start` | 200 | `next: "login"` |
| Sign with the stored passkey | POST | `/web/auth/verify` | 200 | sets the session; `X-Web-Session-*` headers present |
| Check the session | GET | `/web/auth/session` | 200 / 401 | `{ user, session }` with `db_role`; 401 without a session |
| Log out | POST | `/web/auth/logout` | 200 | ends the session on the server |
| A company-management read | GET | `/web/users/provision-options` | 401 without a session | the API smoke's negative probe |

The session, logout and provision-options rows come from the served client and the smoke cases;
the live API runs will confirm them.

## Behaviour
- Enrollment and login go through the same form: `start` decides. The virtual authenticator
  (ctap2, internal, resident key, user verification) satisfies both, and the exported
  credential logs in again from a fresh browser.
- Repeated logins with the stored credential work: on 2026-10-16 the setup project logged the
  operator in, and `AUTH-UI-001` passed in four separate runs. The framework saves the
  credential after every login, so its signature counter stays in step with the server.

## Open questions
- Does the server enforce the signature counter? Saving it after every login makes this
  harmless either way; a test that replays an old credential would answer it, and is not worth
  the risk to the QA user.
- Provisioning the QA Employee: does it send anything to the phone number (plan Q5)? Until
  that is known, only numbers the owner controls are used.
- The re-authentication dialog: which actions raise it after the idle timeout, and whether
  confirming it resumes the interrupted action. The session-expiry request (backlog 1) explores it.
