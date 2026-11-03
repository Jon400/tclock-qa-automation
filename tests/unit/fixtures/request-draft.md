# Session expiry and the re-auth dialog

## User story

As an operator, I want an expired session to ask me to confirm my passkey again, so that I can
keep working without losing my place.

## Acceptance criteria

1. When the session has expired, the next company-management action shows the re-authentication dialog.
2. Confirming the passkey in the dialog completes the action that was interrupted. (inferred)
3. The session endpoint answers 401 after the session has expired. (inferred)

## Area

auth

## Roles involved

- operator

## Out of scope

- None.

## Links

- None.
