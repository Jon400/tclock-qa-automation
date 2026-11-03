# TClock QA Automation

AI-orchestrated QA automation for [TClock](https://dev.tclock.co.il), a Hebrew/RTL
time-and-attendance back office with passkey login.

> Let AI agents make engineering decisions, but let code, tests and explicit policies determine
> whether their work is accepted.

Three parts work together:

1. **A TypeScript + Playwright Test framework**: page objects, MUI components, Hebrew label maps,
   `/web/*` API clients with zod schemas, passkey login through a CDP virtual authenticator,
   data builders with cleanup, and custom matchers.
2. **A traceable test lifecycle** in `.test/`: every acceptance criterion becomes a requirement,
   every requirement is covered by planned cases, and every test traces to exactly one case.
   The gate computes the coverage report; nobody types it.
3. **A multi-agent dev loop** (`tools/dev-loop`): from a test request to a validated pull request
   and one GitHub issue per product bug. Agents plan and write; ordinary code checks every
   hand-off; the owner approves at four gates.

## Quick start

Requirements: Node 24, the GitHub CLI (`gh auth login`), and the two QA users' phone numbers.

```bash
npm ci
npx playwright install chromium
cp .env.example .env                      # set QA_OPERATOR_PHONE and QA_EMPLOYEE_PHONE
npm run auth:enroll -- --role operator    # once per QA user, after provisioning it in TClock
npm run auth:enroll -- --role employee

npm run test:setup                        # log both roles in once
npm run test:smoke -- --no-deps           # the smoke suite against dev
npm run report                            # the Allure report of the latest run
```

## Commands

| Command | What it does |
|---|---|
| `npm run typecheck` / `lint` / `format:check` | tsc, ESLint (with the spec rules), Prettier |
| `npm run test:unit` | Vitest: framework, quality gate, dev loop, hooks |
| `npx playwright test --list` | collect every test; needs no `.env` |
| `npm run gate` | the full quality gate → `.orchestrate/gate.json`, `coverage-report.md` |
| `npm run test:setup` | the `setup` project: passkey login per role, saved sessions |
| `npm run test:smoke` / `test:area` / `test:regression` | run profiles (`.test/execution-plan.md`) |
| `npm run report` | build the Allure report for a run |
| `npm run loop -- --issue <n>` | the dev loop for a filed test request |
| `npm run loop -- --prompt "<what to test>"` | the orchestrator drafts the request first (Gate 0) |
| `npm run loop -- --next` | the next backlog line and its issue |
| `npm run loop -- ... --dry-run` | print every stage, gate and write; change nothing |

## The dev loop

```
request issue ─► orchestrator ─► test-planner ─► ✋A ─► framework-architect ─► test-developer-ui ∥ api
  (✋0 for a prompt)  plan + task graph   .test/<area>/           (only if needed)        specs
      ─► quality gate ─► code-reviewer (≤2 repair rounds) ─► test run ─► triage ─► ✋B ─► bug issues
      ─► ✋C ─► commit ─► regression ─► pull request (CI results · Allure · coverage · bugs · approval)
```

- **Deterministic gates.** `tools/gates` runs tsc, ESLint, Prettier, `playwright test --list`,
  Vitest, traceability and coverage, an assertion-integrity check, a config guard and secretlint.
  Its exit code decides.
- **Least privilege.** Each agent writes only its lane (hook-enforced, then re-checked by the
  driver); no agent may run `gh` or a git write; secrets and any host but dev are blocked.
- **Owner gates.** 0: the request draft · A: the plans · B: bug drafts and quarantines ·
  C: the commit and the PR. Merging stays manual.

Details: `.doc/architecture.md`.

## Repository map

| Path | Purpose |
|---|---|
| `AGENTS.md` (loaded by `CLAUDE.md`) | the contract every agent and session follows |
| `src/` | the framework |
| `tests/` | fixtures, the setup project, UI / API / E2E suites, unit tests |
| `.test/` | master test plan, execution plan, quarantine registry, per-area plans |
| `.plan/` | backlog and implementation plans |
| `.doc/` | product definition, SUT overview, architecture, glossary, exploration notes |
| `tools/gates/`, `tools/dev-loop/`, `tools/auth/` | the quality gate, the loop driver, passkey enrollment (owner-only) |
| `.claude/` | agents, hooks, rules, skills, Playwright MCP config |
| `.github/` | test-request and bug-report issue templates, the PR template |
| `.orchestrate/` | generated output of runs and the loop (gitignored) |

## Safety

TClock belongs to someone else. Automation works only on `dev.tclock.co.il`, only as the two QA
users, and only on entities it created (`qa-<runId>-...`). No load, fuzzing or scanning.
Sessions, passkeys, traces and screenshots never leave the owner's machine, and
security-sensitive findings are never filed publicly.
