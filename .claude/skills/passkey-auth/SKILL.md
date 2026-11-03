---
name: passkey-auth
description: How TClock login works in this framework (phone + passkey through a CDP virtual authenticator), where sessions and credentials live, and what to do when a login fails. Use when touching src/auth/, tests/setup/, the role fixtures, a case that ends or expires a session, or when the setup project fails.
---

# Passkey Auth

TClock logs in with a phone number and a passkey: `POST /web/auth/start` answers `enroll` or
`login`, the browser signs a WebAuthn challenge, `POST /web/auth/verify` sets the session
cookie. There is no password, OTP or SMS step. The session lasts 15 minutes idle and 5 hours
at most (`X-Web-Session-*` headers).

## The pieces

| Piece | What it does |
|---|---|
| `src/auth/virtual-authenticator.ts` | A CDP WebAuthn virtual authenticator (ctap2, internal, resident key, user verification) on one page |
| `src/auth/passkey-store.ts` | Reads and writes `.auth/passkey.<role>.json` (zod-validated), with a per-role lock |
| `src/auth/passkey-login.ts` | `loginWithPasskey(page, role, phone)`: imports the credential, submits the login form, saves the credential back |
| `tests/setup/auth.setup.ts` | The `setup` project: logs every role in once per run and saves `.auth/<role>.json` (storage state) |
| `tests/fixtures.ts` | `operatorPage`, `employeePage`, `*Api` reuse that storage state; `freshOperatorPage` logs in on its own |
| `tools/auth/enroll.ts` | Owner-only: `npm run auth:enroll -- --role operator` enrolls a newly provisioned QA user |

## Rules

- Only the two QA users, `QA Operator` and `QA Employee`. The owner's own passkey is never used.
- `.auth/` and `passkey*.json` are secrets: gitignored, blocked for every agent by a hook, never
  printed, attached or uploaded. Whoever holds a passkey file can log in as that user.
- The credential is saved again after every login, because the server may check the signature
  counter. Logins of one role are serialised by a lock, never by `@serial`.
- Specs never log in. They take a role fixture. A case that ends or changes its session
  (logout, expiry, re-auth) uses `freshOperatorPage`, so the shared session stays valid.
- `--repeat-each` would repeat the `setup` project too, so the driver runs `setup` once and every
  other step with `--no-deps`. Locally: `npm run test:setup`, then `npx playwright test --no-deps ...`.

## When login fails

1. `npm run test:setup` alone. A `SettingsError` names the missing `.env` variable
   (`QA_OPERATOR_PHONE`, `QA_EMPLOYEE_PHONE`).
2. "No passkey for role": the owner runs `npm run auth:enroll -- --role <role>` after
   provisioning that user in the TClock UI.
3. `/web/auth/start` answers `enroll` for an enrolled user, or `/web/auth/verify` fails: the
   stored credential no longer matches the server (re-provisioned user, counter drift). The
   owner re-enrolls; an agent never touches `.auth/`.
4. The dev host answers 5xx or a Cloudflare page: an environment problem, not a test bug.
