# Git Workflow

## Approval gates — no exceptions
- **Never commit** until the owner explicitly approves committing.
- **Never merge** a branch without explicit approval. Merges stay manual; a hook blocks
  `gh pr merge`.
- **Never push a release tag** without explicit approval.
- Agents never run `git` write commands or `gh` at all. The dev-loop driver commits after
  Gate C, and only the driver and the owner talk to GitHub.

## The dev loop's owner gates
| Gate | The owner approves | Before |
|---|---|---|
| 0 | the request draft (prompt runs only) | the driver files the request issue |
| A | the implementation plan, the area test plan and execution plan, any deferred criterion | framework and test work starts |
| B | each bug draft (file, keep local, drop) and each quarantine proposal | bug issues are filed |
| C | the commit and the pull request | the driver commits and opens the PR |

## Branches
- Work on a dedicated branch, never on `main`. Create it before executing an approved plan.
- One plan, request or workstream per branch.
- Lowercase, predictable names, singular domain terms:
  - `feat/<topic>` — new framework capability
  - `fix/<topic>` — bug fix in the framework or tooling
  - `test/<area>` — suite work done by the dev loop for one request
  - `chore/<topic>` — maintenance
  - `docs/<topic>` — documentation only

## Commits
- Conventional Commits, checked by commitlint: `<type>(<scope>): <imperative subject>`.
  Types: `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `ci`, `build`.
  Example: `test(auth): add session expiry cases`.
- One intent per commit. Do not bundle unrelated changes.

## Merges
- At least one review pass before merge. In the loop, that is the code-reviewer stage plus
  the owner at Gate C.
- Resolve open comments and questions before merging.

Release tagging and version numbers are a separate procedure — see the
`cutting-a-release` skill.
