# Quarantine registry

Owner only. No agent role may write this file (`.claude/hooks/enforce-agent-boundaries.js`).

A case may carry `@quarantine` only while it has a row here. Quarantined cases still run in
their area profile, but they do not count toward exit criteria and are excluded from
regression. Each row links the bug issue (or flaky-test issue) that explains it. Remove the
row and the tag when the issue is fixed and the case passes again.

## Registry

| Case ID | Issue | Reason | Approved by | Date |
|---|---|---|---|---|
