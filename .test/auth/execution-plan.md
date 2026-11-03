---
area: auth
grep: "@auth"
newCaseRepeat: 3
serial: false
dependsOnProfiles: [smoke]
exit:
  p1PassRate: 100
  overallPassRate: 100
  maxNewFlaky: 0
  untriagedFailures: 0
---

# auth — Execution plan

Status: active
Last updated: 2026-10-16

## Data setup

- No data is created. The cases use the two long-lived QA users and their sessions from
  the setup project (`.auth/operator.json`, `.auth/employee.json`).
- AUTH-UI-003 logs in on its own and logs that session out; the shared sessions stay valid.

## Serial groups

None. Logins of the same role are serialised by the passkey lock, not by `@serial`.

## Area exit criteria

All five cases pass in the area run and in each of the 3 repeats: every case is P1, so
`p1PassRate` and `overallPassRate` are both 100. No case may be flaky.
