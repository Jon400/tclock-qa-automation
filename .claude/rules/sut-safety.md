# SUT Safety

TClock (`https://dev.tclock.co.il`) belongs to someone else. We test it as a guest.

- The dev host is the only target. Settings reject any other `BASE_URL`, a hook blocks
  any other `tclock.co.il` host, and Playwright MCP runs with `--allowed-origins`.
- Work only inside the owner's sandbox company, as the two QA users (`QA Operator`,
  `QA Employee`) and the `qa-` entities a run creates. The owner's own passkey is never used.
- No load testing, fuzzing, brute force, scanning, or high request rates. Keep traffic to
  what a careful human tester would generate.
- The served client source may be read to understand behaviour. Never copy it into this
  repository.
- Security-sensitive findings never go into a public place: no GitHub issue, no PR, no
  commit. They stay as local drafts in `.orchestrate/bugs/` for the owner.
- Traces, screenshots and storage state can hold session cookies or company data. They
  stay local and are never attached to an issue.
- Black-box only: no platform-admin flows, and no contact with the TClock team.
