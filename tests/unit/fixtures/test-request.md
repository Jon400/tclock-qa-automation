# Session expiry and the re-auth dialog

<!-- A local test request in the test-request issue template's format. Used by
     `npm run loop -- --request-file tests/unit/fixtures/test-request.md --dry-run`
     and by tests/unit/dev-loop. -->

## User story

As an operator, I want an expired session to ask me to confirm my passkey again, so that I can
keep working without losing my place and nobody can use a session I left open.

## Acceptance criteria

1. When the session has expired, the next company-management action shows the re-authentication dialog.
2. Confirming the passkey in the dialog completes the action that was interrupted.
3. Closing the dialog without confirming leaves the operator logged out.
4. The session endpoint answers 401 after the session has expired.

## Area

auth

## Roles involved

- operator

## Out of scope

- Changing how long a session lasts.

## Links

- None.
