# Product Definition

## Purpose
An AI-orchestrated QA automation project for TClock (`https://dev.tclock.co.il`). It is a
portfolio and learning project: it shows a professional TypeScript + Playwright Test
framework, a traceable test lifecycle, and a multi-agent workflow whose output is accepted only
by deterministic checks.

## Product Vision
> Let AI agents make engineering decisions, but let code, tests and explicit policies determine
> whether their work is accepted.

The owner writes (or approves) a test request. Agents plan the tests, build the framework
pieces and write the specs; ordinary code gates every hand-off; the owner approves at four
gates. Every run ends in a validated pull request and one GitHub issue per product bug found.

## Problem Statement
AI coding agents write tests quickly, but unchecked they also weaken assertions, skip failing
tests, put locators in specs, hard-code data and drift from the requirements. A useful agentic
QA setup has to make those failure modes impossible or visible, not merely discouraged.

## Value Proposition
- **Traceability:** every acceptance criterion → requirement → planned case → test → last
  result, computed by the gate into `.orchestrate/coverage-report.md`.
- **Deterministic acceptance:** the quality gate's exit code, the test run and the owner decide;
  an agent's own report never does.
- **Least privilege:** each agent writes only its lane; secrets, `gh` and git writes are out of
  reach; the dev host is the only target.
- **A framework a human would keep:** page objects, API clients, fixtures, builders and
  matchers, in the guide's layout with the owner's itac-arena class patterns.

## Product Scope
- In scope: the framework (`src/`, `tests/`), the `.test/` lifecycle, the quality gate
  (`tools/gates`), the dev-loop driver (`tools/dev-loop`), the agent definitions, rules, skills
  and hooks, and test suites for TClock's back office, area by area.
- Out of scope: changes to TClock; load, security or accessibility testing; browsers other than
  Chromium; platform-admin flows; contact with the TClock team; CI (a backlog item).

## Target Users
- Primary user: the owner, a QA automation engineer, who writes requests, approves the gates
  and merges.
- Secondary users: readers of the repository (reviewers, hiring managers) and the agents
  themselves, which read `AGENTS.md`, the rules and the skills.

## Acceptance Criteria
Each criterion is proven by the command or test named with it.

- **AC01 — Toolchain.** `npm ci` succeeds with Node 24; `npm run typecheck`, `npm run lint` and
  `npm run format:check` each exit 0.
- **AC02 — Collection without secrets.** `npx playwright test --list` lists every test with no
  `.env` present.
- **AC03 — Unit tests.** `npm run test:unit` passes: settings guard, run IDs, passkey store,
  `BaseClient`, parsers, gate checks, the dev-loop modules and the hooks.
- **AC04 — Quality gate.** `npm run gate` exits 0 and writes `.orchestrate/gate.json` and
  `.orchestrate/coverage-report.md`, which shows every `AUTH-AC-*` covered and all five auth
  cases automated. Each negative fixture in `tests/unit/gates/` makes its check fail.
- **AC05 — Determinism.** An `@anthropic-ai/*` import in `src/` or `tests/` fails
  `npm run lint` (`tests/unit/gates/eslint-rules.test.ts`).
- **AC06 — Host allowlist.** `BASE_URL=https://example.com npx playwright test --project=setup`
  exits non-zero with the settings error before any page opens, and
  `tests/unit/config/settings.test.ts` rejects every host but the dev host.
- **AC07 — Passkey login.** `npx playwright test --project=setup` creates `.auth/operator.json`
  and `.auth/employee.json`, and `git check-ignore` matches both.
- **AC08 — Smoke without re-login.** After one `npm run test:setup`,
  `npm run test:smoke -- --no-deps --repeat-each=3` passes 15 of 15.
- **AC09 — Report.** `npm run report` builds an Allure report showing case IDs and tags.
- **AC10 — Guardrails.** The hook tests in `tests/unit/hooks/` pass: wrong host, secret files,
  destructive commands, `gh` for agents, and every lane boundary.
- **AC11 — Commit hygiene.** `echo "bad message" | npx commitlint` exits non-zero.
- **AC12 — Dev loop, offline.**
  `npm run loop -- --request-file tests/unit/fixtures/test-request.md --dry-run` and
  `npm run loop -- --prompt "test the auth session expiry" --dry-run` both exit 0 without
  spawning an agent or calling a `gh` write command.
- **AC13 — Dev loop, live.** With `gh auth login` done,
  `npm run loop -- --prompt "<the auth session-expiry request>"` stops at Gate 0 with a draft
  that parses; after approval the issue carries `test-request` and `area:auth`, and the run
  writes a valid `.orchestrate/request.json`.
