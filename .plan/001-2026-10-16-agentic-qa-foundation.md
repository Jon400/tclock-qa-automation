# 001 — Agentic QA foundation: TypeScript + Playwright framework, `.test/`, agent loop

Status: active
Owner: Jon400
Last updated: 2026-10-16
Backlog item: QA framework foundation + `.test/` + test-flow dev loop

## Goal

Turn this repository into an AI-orchestrated QA automation project for **TClock**
(`https://dev.tclock.co.il`), a Hebrew/RTL time-and-attendance back office with passkey login.
It is a portfolio project, so three things have to work together:

1. **A professional TypeScript + Playwright Test framework.** The repository follows the
   orchestration guide's reference layout (`config/`, `ui/` with a base page, pages and components,
   `api/` with a base client and clients, `utils/`, and `tests/{ui,api,e2e}`). Inside that layout,
   the classes follow the owner's `itac-arena-qa-automation` patterns: the `RestClient` request
   API, the page-object shape, and the fixture set. Both are ported to TypeScript and extended for
   what TClock needs: passkey auth, MUI components, Hebrew labels, and data cleanup.
2. **A test lifecycle with traceability.** Every request arrives with acceptance criteria. Every
   criterion is covered by planned cases in `.test/`, every test traces to exactly one planned
   case, and every run follows a written execution plan.
3. **The guide's multi-agent architecture with deterministic gates**, from a user story to a
   validated pull request:

   > Let AI agents make engineering decisions, but let code, tests and explicit policies determine
   > whether their work is accepted.

   An orchestrator agent coordinates specialist agents. A TypeScript driver runs the stages,
   runs the quality gate as ordinary code, caps the repair loops, and stops at human approval gates.

This plan delivers the foundation and proves it end to end on the `auth` area. Every other area
then goes through the agent loop as its own request.

## Scope

### Architecture

This is the guide's architecture, box by box. Between two boxes, the driver checks the hand-off in
code before the next box starts (`↳` lines).

```
 User story / feature request    a GitHub Issue from the test-request template (user story, numbered
 + existing repository           acceptance criteria, area, roles), or a prompt that the orchestrator
                                 drafts into one · AGENTS.md, .doc/, .test/, src/
          │ ↳ prompt only: the draft parses as a test request
          │                                                          ✋ Gate 0: owner approves the draft;
          │                                                             the driver files it as the issue
          │ ↳ intake (code): gh issue view --json → .orchestrate/request.json, zod-validated
          ▼
 Orchestrator Agent              orchestrator: analyses scope, assigns stages, tracks dependencies,
                                 sets lane file ownership → plan + task graph
          │ ↳ task graph matches its schema; every acceptance criterion is assigned to an area
          ▼
 Test Planner                    test-planner: scenarios, AC coverage, risks → .test/<area>/
          │ ↳ test plan parses; every AC is covered or deferred with a reason
          │                                                          ✋ Gate A: owner approves
          ▼
 Framework Architect             framework-architect: fixtures, settings, abstractions (only when needed)
          │ ↳ tsc · eslint · vitest
          ▼
 Test Developer                  test-developer-ui ∥ test-developer-api: UI + E2E specs ∥ API specs
          │ ↳ full quality gate
          ▼
 Code Reviewer                   code-reviewer: architecture, quality, safety
          │                      ⟲ findings → owning agent, ≤2 repair rounds, gate re-run each round
          │ ↳ no open blocker and the gate is green
          ▼
 Test Runner &                   runner = driver code: setup → smoke → area → new cases × 3
 Failure Analyzer                classify = driver rules (env, flaky) → owner (phase 1) /
                                 failure-analyzer agent (phase 2) → bug drafts for product bugs
          │ ↳ no untriaged failure; every product bug has a bug draft
          │                                                          ✋ Gate B: owner approves bugs
          ▼                                                             and quarantines
 Bug issues                      driver: gh issue create from the bug-report template, one issue per
                                 product bug, linked to the case and the request issue
          │ ↳ area exit criteria met over the cases that are not quarantined
          │                                                          ✋ Gate C: owner approves
          ▼                                                             commit + PR
 Validated Pull Request          CI results · Allure evidence · coverage report · bug issues · owner
                                 approval. Closes the request issue on merge; merge stays manual
```

### Decisions

| Topic | Decision |
|---|---|
| Purpose | Portfolio and learning. Breadth of engineering practice matters more than raw coverage |
| Access | One operator account on dev, in a sandbox company only the owner uses. Black-box testing: no platform admin, no contact with the TClock team |
| Input | Every run starts from a GitHub Issue in the `test-request` format: user story, numbered acceptance criteria, area, roles, out of scope. The owner either writes it (`gh issue create --template "Test request"`) or gives the loop a prompt; the orchestrator drafts the issue from the prompt, and the driver files it after Gate 0. Backlog lines link their issue |
| Bugs | Each product bug becomes a GitHub Issue in this repository, made from the `bug-report` template. The driver renders the draft and files it after Gate B. Labels are `bug` and `area:<area>`, and the issue links the case ID, the run ID and the request issue. Security-sensitive findings and traces never go into an issue |
| GitHub | GitHub is the only platform: repository, issues, pull requests and Actions. Every GitHub operation goes through the GitHub CLI (`gh`) with `--json` output. No GitHub MCP server, no API client code, and no token in the repository (`gh auth login` holds the credential). Only the driver and the owner call `gh`; agents never do |
| Stack | Node 24 LTS, TypeScript (strict, ESM), `@playwright/test`, zod, Vitest for framework unit tests, `allure-playwright` |
| Repository layout | The guide's reference layout, translated to TypeScript (tables below) |
| Class patterns | Ported from `itac-arena-qa-automation` (mapping table below) |
| Test layers | **UI**, **API** (the `/web/*` back-office endpoints through Playwright's `APIRequestContext`), cross-layer **E2E**, and **unit** tests for framework and tooling code. The test planner puts each check on the cheapest layer that can prove it |
| Auth | A Chromium CDP virtual authenticator enrolls and logs in dedicated QA users. A `setup` project logs each role in once per run and saves `.auth/<role>.json`, which every worker reuses |
| UI language | Hebrew pinned: `he-IL` locale, `Asia/Jerusalem` timezone, and an init script setting `tclock-language=he` and `tclock-color-mode=light` |
| Test artifacts | `.test/` holds the master test plan, the global execution plan, the quarantine registry, and one test plan + one execution plan per area. `.plan/` keeps implementation plans only |
| IDs | Acceptance criteria `<AREA>-AC-NN` (for example `AUTH-AC-01`); cases `<AREA>-<LAYER>-NNN` (for example `AUTH-UI-001`), attached to each test as a `case` annotation |
| Agents | The guide's roles under their full names: `orchestrator`, `test-planner`, `framework-architect`, `test-developer`, `code-reviewer`, `failure-analyzer` |
| Orchestration | Claude Code agents defined in `.claude/agents/`, run by a deterministic TypeScript driver (`tools/dev-loop/`) that the owner starts from the terminal. No standalone service that picks up tickets on its own |
| Parallel work | Two test-developer lanes, UI and API, run at the same time in one working tree. A hook keeps their write paths disjoint |
| Repair loop | At most 2 repair rounds, then escalate to the owner |
| Quality gate | `tools/gates/`, invoked directly by the driver. The exit code is the verdict, never an agent's report |
| Failure classification | Driver rules first (env issue, flaky). Anything left is untriaged and goes to the owner in phase 1 and to the failure-analyzer in phase 2 |
| Pull request evidence | CI results, Allure evidence, coverage report, bug issues, owner approval (see "The validated pull request") |
| Runs | Local runs against dev in v1 |
| CI | GitHub Actions, delivered by the CI backlog item. Its workflows call the same npm scripts |
| Reporting | Allure 3 (npm package, no Java), JUnit XML, Playwright traces on failure |
| Practices | ESLint + `eslint-plugin-playwright`, Prettier (`semi: false`), strict `tsc`, husky + lint-staged + commitlint, `secretlint`, retries 0, `--repeat-each=3` flake check, quarantine only with owner approval |
| Toolchain pins | TypeScript stays on 6.0.x, the newest version `typescript-eslint` supports. Prettier formats code and config, not Markdown: the plans and docs keep their hand-made tables |
| Passkey enrollment | An owner-only tool, `npm run auth:enroll -- --role <role>` (`tools/auth/enroll.ts`), which is the step 6 spike kept as the re-enrollment tool |
| Lane enforcement | Two layers from one list (`.claude/hooks/lib/role-write-paths.js`): the hook blocks a write before it happens, and the driver compares the working tree before and after each agent stage, which also catches writes made through Bash. The unit tests of `tools/` and the hooks (`tests/unit/{gates,dev-loop,hooks,fixtures}/`) are owner-only, and only they may import `tools/` |

### The guide's repository layout, applied

| Guide | This repository | Why it differs |
|---|---|---|
| `AGENTS.md` | `AGENTS.md` (imported by `CLAUDE.md`) | Same |
| `agents/{planner,architect,developer,reviewer,failure_analyzer}.md` | `.claude/agents/{orchestrator,test-planner,framework-architect,test-developer,code-reviewer,failure-analyzer}.md` | Claude Code only reads agents from `.claude/agents/`. Files use the guide's full role names in kebab-case, which say more than the short ones. The orchestrator gets its own file because the driver calls it for scoping |
| `docs/architecture.md` | `.doc/architecture.md` | Repository rule: never create `docs/` |
| `docs/coding_standards.md` | `.claude/rules/*.md` | Split into short always-on rules that every agent loads |
| `docs/test_strategy.md` | `.test/master-test-plan.md` | Lives next to the test plans it governs |
| `src/qa_automation/` | `src/` | The extra package folder is a Python packaging need |
| `src/qa_automation/config/settings.py` | `src/config/settings.ts` (+ `enum.ts`) | zod instead of Pydantic |
| `src/qa_automation/ui/{base_page.py,pages/,components/}` | `src/ui/{base-page.ts,pages/,components/}` (+ `labels/`) | `labels/` holds the Hebrew accessible names |
| `src/qa_automation/api/{base_client.py,clients/}` | `src/api/{base-client.ts,clients/}` (+ `schemas/`) | zod response schemas |
| `src/qa_automation/utils/` | `src/utils/` | Same |
| — | `src/{auth,data,assertions}/` | TClock needs passkey login and data cleanup; matchers keep assertion logic named and reusable |
| `tests/conftest.py` | `tests/fixtures.ts` (+ `tests/setup/`) | Playwright fixtures replace pytest fixtures |
| `tests/{ui,api,e2e}/` | `tests/{ui,api,e2e}/` (+ `tests/unit/`) | Unit tests cover framework and gate code |
| `specs/` | `.test/` | One home for test plans and execution plans, next to `.plan/` and `.doc/` |
| `pyproject.toml` | `package.json`, `tsconfig.json`, `playwright.config.ts`, `vitest.config.ts`, `eslint.config.js` | TypeScript toolchain |

### The guide's process, applied

| Guide | This repository | Why it differs |
|---|---|---|
| User story / ticket / feature request | GitHub Issue from the `test-request` template, written by the owner or drafted from the owner's prompt | GitHub only, driven through the GitHub CLI |
| Bug report | GitHub Issue from the `bug-report` template, filed by the driver after Gate B | Same |
| Orchestrator → Test Planner → Framework Architect → Test Developer → Code Reviewer → Test Runner & Failure Analyzer → Validated PR | Same chain (Architecture above). The runner is driver code. The failure-analyzer agent arrives in phase 2; until then the driver's rules and the owner classify | Guide: add the Failure Analyzer once test generation is stable |
| Start with planner, developer and reviewer; add the architect for shared infrastructure | The framework architect runs only when the task graph touches `src/`, fixtures or config | As the guide says |
| Sequential, then parallel UI ∥ API, then an evaluator–optimizer loop capped at 2–3 rounds | Same, capped at 2 rounds | As the guide says |
| Separate file ownership **or** worktrees | File ownership, enforced by a hook | Worktrees need commits on lane branches; the git rule forbids commits before owner approval (Q2) |
| Quality gates in ordinary code | `tools/gates/`; the exit code decides | As the guide says |
| Python, Pytest, async Playwright, HTTPX, Pydantic | TypeScript, Playwright Test, `APIRequestContext`, zod | Owner's stack choice. Playwright Test is async throughout, so the guide's async advice comes for free |
| Ruff, Pyright/MyPy, test collection | ESLint, `tsc --noEmit`, `playwright test --list` | Same checks in the TypeScript toolchain |
| Traceability | `.test/` + the coverage report | Requirement → case → test → result, computed by the gate |
| Playwright's planner / generator / healer agents | Not installed as-is. Their Playwright MCP server becomes the test planner's exploration tool; their prompts are reference material for our roles (Q3) | The generator writes raw locators into specs, and the healer edits failing tests directly. Both conflict with the rules below |

### In scope
- Fixing the guardrail hooks, then rewriting the AI context in place: `AGENTS.md`, rules,
  skills, agents, hooks, `settings.json`, `.mcp.json`, `.doc/`, `README.md`, and the GitHub
  issue and PR templates.
- Creating `.test/` with the master test plan, the execution plan, the quarantine registry, and
  the `auth` area as the reference example.
- Scaffolding the TypeScript framework in the guide's layout with itac-arena's class patterns:
  config, UI and API layers, fixtures, auth, data, assertions, utils.
- A passkey auth spike, then smoke cases on the UI and API layers.
- The quality gate (`tools/gates/`) and the dev-loop driver (`tools/dev-loop/`), from a prompt
  or a request issue to the validated pull request and a bug issue for each product bug.
- Seeding the backlog with one request per feature area.

### Out of scope (later plans)
- The CI pipeline (GitHub Actions workflows) and nightly regression (already a backlog item).
- The `failure-analyzer` agent (phase 2 backlog item, per the guide).
- A standalone orchestration service that picks up issues and opens PRs without the owner starting it.
- Role access matrix, accessibility, visual regression, i18n parity, cross-browser runs. The
  virtual authenticator needs CDP, so runs are Chromium only.
- Platform-admin flows (`/companies/new`). At most, a negative check that an operator is denied.
- Any change to TClock itself.

### itac-arena patterns → the guide's layout

The class shapes carry over from itac-arena, and the folders follow the guide. The code is ported
by hand, using TypeScript and Playwright Test idioms.

| itac-arena (Python) | Here (TypeScript) | Notes |
|---|---|---|
| `src/settings.py` (pydantic-settings over `.env`) | `src/config/settings.ts` (zod schema over `process.env`, loaded with `dotenv`) | Adds the host allowlist. Validated in the `setup` project, so `playwright test --list` works without `.env` |
| `src/enum.py` (`BrowserType`) | `src/config/enum.ts` (`BrowserType`, `Role`, `Area`) | `as const` objects plus union types instead of `enum` |
| `src/api/rest_client.py`: `RestClient` with `execute_request` / `execute_get/post/put/delete`, and `verify_status` as a soft check inside an Allure step | `src/api/base-client.ts`: `BaseClient` over `APIRequestContext` with `executeRequest` / `executeGet/Post/Put/Delete`, and `verifyStatus` as `expect.soft` inside `test.step` | Same request API you already know. The context carries the role's session cookies, so API and UI share one login |
| `src/api/itac_arena_client.py` (`ITACArenaClient(RestClient)`) | `src/api/clients/<resource>-client.ts` (`SessionClient`, `UserClient`, `BranchClient`, …, each extending `BaseClient`) | One client per `/web/*` resource instead of one large client |
| `src/utils/classes/json_handler.py` | `src/api/schemas/<resource>.ts` (zod response schemas) | Typed parsing replaces the dict wrapper |
| `src/pages/base_page.py` | `src/ui/base-page.ts` | Generic. Nothing TClock-specific |
| `src/pages/itac_arena/itac_arena_base_page.py` (logout) | `src/ui/pages/tclock-base-page.ts` (navbar, logout, re-auth dialog) | Product base page every page object extends |
| `src/pages/itac_arena/<x>_page.py`: `PATH`, locators in the constructor, `open()`, actions that return the next page | `src/ui/pages/<x>-page.ts`, same shape | Accessible names come from `src/ui/labels/<x>.he.ts` |
| — | `src/ui/components/mui/` (data table, date and month pickers, dialog, snackbar) and `src/ui/components/` (navbar, re-auth dialog) | TClock is built on MUI. `mui/` stays generic |
| — | `src/auth/` (virtual authenticator, passkey export and import) | Passkey login instead of a password |
| — | `src/data/` (`runId`, builders, cleanup registry, test-data loader) | TClock entities can only be deactivated, never deleted |
| — (assertions sat in the client) | `src/assertions/` (custom matchers via `expect.extend`, e.g. `toShowSnackbar`, `toBeAccessDenied`) | |
| `src/utils/libraries/` (`date_utils`, `file_utils`) | `src/utils/` (`date-utils`, `file-utils`, `excel-utils`) | Flat, as in the guide |
| `tests/conftest.py`: `settings`, `itac_arena_page`, `logged_in_*_page`, `*_client`, `logged_in_as_<role>_*_client` fixtures | `tests/fixtures.ts`: `test.extend` with `settings`, `runId`, `operatorPage`, `employeePage`, `operatorApi`, `employeeApi`, `cleanup` | Playwright fixtures work like pytest fixtures. Worker-scoped ≈ session scope per xdist worker |
| Login inside the `logged_in_*` fixture, run for each test | `tests/setup/auth.setup.ts`: a `setup` project that every other project depends on | Built-in replacement for "log in once per run" |
| `tests/test_order_ticket.py` | `tests/{ui,api,e2e}/<area>/<behaviour>.spec.ts` | Split by layer |
| `doc/test_plan.txt` | `.test/<area>/test-plan.md` | Structured, parsed by the gate |
| `pytest_check` soft assertions | `expect.soft` | Built in |
| `allure-pytest` | `allure-playwright` | |
| `.env`, `.env.example` | same | `.env` and `.auth/` are blocked from agents by a hook |

Patterns that do **not** carry over: fixed sleeps (`wait_for_timeout`), disabled TLS
verification, commented-out test code, data names hard-coded in tests, mixed import roots, and
fixtures that launch the browser by hand (Playwright Test manages the browser).

### Target layout

```
tclock-qa-automation/
├── AGENTS.md / CLAUDE.md            # shared contract: stack, abstractions, rules, validation commands, prohibited ops
├── .claude/
│   ├── agents/                      # orchestrator, test-planner, framework-architect, test-developer, code-reviewer (+ failure-analyzer, phase 2)
│   ├── hooks/                       # role write paths, secret files, destructive bash, target host allowlist
│   ├── rules/                       # coding standards as short always-on rules
│   └── skills/                      # procedures, loaded on demand
├── .github/
│   ├── ISSUE_TEMPLATE/test-request.md    # the request template: user story, acceptance criteria, area, roles
│   ├── ISSUE_TEMPLATE/bug-report.md      # the product-bug template: case, steps, expected, actual, run
│   └── pull_request_template.md     # the validated PR: request, coverage, gate, Allure, bugs, review, approval
├── .mcp.json                        # Playwright MCP, one server per role, dev origin only (test-planner exploration)
├── .doc/
│   ├── product-definition.md        # this QA project: purpose, scope, acceptance criteria
│   ├── sut-overview.md              # TClock: roles, access modes, areas, risk ranking
│   ├── architecture.md              # framework layers, agent architecture, gate design
│   ├── glossary.md                  # TClock domain terms
│   └── sut/<area>.md                # test-planner exploration notes: routes, roles, Hebrew names, /web/* calls
├── .test/                           # specs: what we test and how we run it
│   ├── README.md                    # lifecycle, ID scheme, who writes what
│   ├── master-test-plan.md          # test strategy: layers, risk ranking, design techniques, entry/exit criteria
│   ├── execution-plan.md            # run profiles, tags, parallelism, retry and quarantine policy
│   ├── quarantine.md                # owner-only registry
│   └── <area>/{test-plan.md, execution-plan.md}
├── .plan/                           # backlog + implementation plans
├── .orchestrate/                    # generated: request draft, request, task graph, reports, gate.json, coverage-report.md, runs/<run-id>/, bugs/, trace.json
├── src/                             # ── framework-architect ──
│   ├── config/
│   │   ├── settings.ts
│   │   └── enum.ts
│   ├── ui/
│   │   ├── base-page.ts
│   │   ├── pages/                   # tclock-base-page.ts + one page object per route
│   │   ├── components/              # mui/ (generic) + TClock components
│   │   └── labels/                  # Hebrew accessible names, one module per page object
│   ├── api/
│   │   ├── base-client.ts
│   │   ├── clients/                 # one client per /web/* resource
│   │   └── schemas/                 # zod response schemas
│   ├── auth/
│   ├── data/
│   ├── assertions/
│   └── utils/
├── tests/
│   ├── fixtures.ts                  # framework-architect
│   ├── setup/auth.setup.ts          # framework-architect
│   ├── unit/                        # framework-architect (Vitest: src/, tools/, hooks)
│   ├── ui/<area>/*.spec.ts          # test-developer-ui
│   ├── e2e/<area>/*.spec.ts         # test-developer-ui (cross-layer, multi-role)
│   └── api/<area>/*.spec.ts         # test-developer-api
├── test-data/{ui,api}/<area>.json   # static inputs per lane, zod-validated by src/data/
├── tools/                           # ── owner only: no agent role may write here ──
│   ├── gates/                       # quality gate, custom checks, coverage report
│   └── dev-loop/                    # driver: intake, stages, caps, classification, PR evidence, trace
├── package.json                     # "type": "module"
├── tsconfig.json · playwright.config.ts · vitest.config.ts · eslint.config.js · commitlint.config.js · .prettierrc
├── .env.example
└── .gitignore
```

`tools/` sits outside the framework on purpose. Tests never import it, and the driver calls
`tools/gates` directly instead of going through `package.json`. That keeps the test run free of
LLM calls (rule 5), and no agent can weaken the gate that judges its work.

### `.test/`: requirements, test plans and execution plans

`.plan/` says *how we build*. `.test/` says *what we test and how we run it*.

| File | Written by | Read by | Content |
|---|---|---|---|
| `master-test-plan.md` | owner (v1 from this plan) | test-planner, code-reviewer | Scope, layers and when to use each, area risk ranking, design techniques (equivalence partitioning, boundary values, state transitions, role × action), environments, entry and exit criteria, ID scheme |
| `execution-plan.md` | owner (v1 from this plan) | driver, test-planner | Run profiles, tags, parallelism, retry and quarantine policy, run artifacts |
| `quarantine.md` | **owner only** (no agent role may write it) | gate | Case ID, linked issue, reason, approved by, date |
| `<area>/test-plan.md` | test-planner | test-developer, code-reviewer, gate | A Requirements table and a Test Cases table. The gate parses both |
| `<area>/execution-plan.md` | test-planner | **driver** (front matter), owner | Front matter the driver reads, then prose for data setup, serial groups and area exit criteria |

**Requirements table:** `ID` (`AUTH-AC-01`) · `Requirement` (copied from the request) · `Source`
(issue link) · `Status` (covered / deferred, with a reason). A deferred criterion needs the owner's
approval at Gate A.

**Test Cases table:** `ID` · `Title` · `Covers` (one or more requirement IDs, or `risk` for a
case the test planner adds from risk analysis) · `Layer` (ui / api / e2e) · `Type` (positive /
negative / edge) · `Priority` (P1 / P2 / P3) · `Preconditions` · `Steps` · `Expected` ·
`Automation` (planned / manual / deferred). The test planner records *intent*. Whether a case is
actually automated, and its last result, are computed into the coverage report, never typed by hand.

**Area execution-plan front matter**, read by the driver:

```yaml
---
area: auth
grep: "@auth"
newCaseRepeat: 3          # --repeat-each for new or changed cases
serial: false             # true → run with --workers=1 (company-wide state)
dependsOnProfiles: [smoke]
exit:
  p1PassRate: 100
  overallPassRate: 100
  maxNewFlaky: 0
  untriagedFailures: 0
---
```

**Run profiles** (`.test/execution-plan.md`):

| Profile | Selection | When | Gating |
|---|---|---|---|
| `unit` | `vitest run` | pre-commit and every gate run | yes |
| `gate` | static checks + `--list` + unit + custom checks | every loop round, before every commit | yes |
| `smoke` | `--grep @smoke` against dev | entry criterion for every area run | yes. Red smoke means the environment is broken and the run stops |
| `area` | the area's `grep`, new cases × `newCaseRepeat` | the Test Runner stage | yes, against the area's exit criteria |
| `regression` | everything except `@quarantine` | before the PR (nightly once CI exists) | yes |

Retries are always 0, because retries hide flakiness. The driver runs the `setup` project once
as its own step, then runs each profile with `--no-deps`. Tests tagged `@serial` run in a separate
`--workers=1` invocation. Every run writes `.orchestrate/runs/<run-id>/`: `junit.xml`,
`allure-results/`, traces, `summary.json` and `failures.json`.

### Agent roster

The guide's roles, with the responsibility and deliverable it gives each one. Write paths are
enforced by `.claude/hooks/enforce-agent-boundaries.js` through `AGENT_ROLE`, which the driver sets
for every agent, the orchestrator included. Each agent definition names only the skills and docs
it needs, so no agent gets the whole repository's context.

| Agent (`AGENT_ROLE`) | Phase | Responsibility | Deliverable | May write | Model |
|---|---|---|---|---|---|
| `orchestrator` | 1 | Drafts a test request from the owner's prompt. Analyses the request's scope, assigns stages, tracks dependencies, sets lane file ownership. Never writes code or tests | Request draft (prompt runs only) + implementation plan + **task graph** | `.plan/`, `.orchestrate/request-draft.md`, `.orchestrate/task-graph.json` | opus |
| `test-planner` | 1 | Explores the area through Playwright MCP; turns each acceptance criterion into positive, negative and edge cases; adds risk-based cases; picks the cheapest layer for each case | Reviewed scenarios, AC coverage and risks: `.test/<area>/` + `.doc/sut/<area>.md` | `.doc/sut/`, `.test/<area>/`, `.orchestrate/explore/` | opus |
| `framework-architect` | 1, on demand | **Defines interfaces before the test developers start**. Answers framework requests | Fixtures, settings, abstractions: clients, page objects, components, labels, schemas, matchers, config, framework unit tests | `src/`, `tests/fixtures.ts`, `tests/setup/`, `tests/unit/`, `playwright.config.ts`, `vitest.config.ts`, `tsconfig.json`, `package.json`, `.orchestrate/framework-architect-report.md` | sonnet |
| `test-developer-ui` | 1 | Implements UI and E2E cases using only fixtures, pages, clients and matchers. Files a framework request for anything missing | Executable specs | `tests/ui/`, `tests/e2e/`, `test-data/ui/`, `.orchestrate/test-developer-ui-*.md` | sonnet |
| `test-developer-api` | 1 | Implements API cases the same way | Executable specs | `tests/api/`, `test-data/api/`, `.orchestrate/test-developer-api-*.md` | sonnet |
| `code-reviewer` | 1 | Reviews the **combined** diff for architecture and layering (nothing TClock-specific in `src/ui/base-page.ts`, `src/ui/components/mui/` or `src/api/base-client.ts`), reuse, naming, typing, test quality (do the assertions prove the Expected column? are tests independent?), and safety (secrets, PII, hosts). Reads code only | Findings and change requests: blocker / should-fix / nit (only blockers fail), each naming its owning agent | `.orchestrate/review-report.md` | opus |
| `failure-analyzer` | **2** | Takes the untriaged failures; reads JUnit, traces and logs; classifies each as product bug / test bug / env issue / flaky. Never edits tests | Root-cause evidence, proposed fixes, bug drafts | `.orchestrate/triage/`, `.orchestrate/bugs/` | opus |
| Test runner: driver code, not an agent | 1 | Runs the profiles and applies the classification rules | `.orchestrate/runs/<run-id>/` | — | — |

Both test-developer lanes share one definition, `.claude/agents/test-developer.md`. The driver
passes the lane in the prompt and in `AGENT_ROLE`. No role may write `tools/`, `eslint.config.js`,
`.test/quarantine.md`, `.test/master-test-plan.md`, `.test/execution-plan.md`, `.claude/`,
`.github/`, `.mcp.json` or `AGENTS.md`. These existing agents are retired: `frontend`, `backend`,
`qa` and `security-reviewer`. Security review moves into the code-reviewer's checklist and the
`secretlint` gate.

### The agent loop

The owner starts one run per request. Every run ends in the same two outputs: a validated pull
request with the new tests, and one GitHub Issue for each product bug those tests found.

```
npm run loop -- --prompt "<what to test>"   # the orchestrator drafts the request issue from the prompt
npm run loop -- --issue <n>                 # the owner already wrote the request issue
npm run loop -- --next                      # the next unchecked backlog line and its linked issue
```

Each stage is one box of the architecture. Code validates each stage's output before the next
stage starts. At a gate (✋), the driver stops and waits for the owner's answer in the terminal.
State lives in `.orchestrate/loop-state.json`, so `--from-stage` resumes a run. `--dry-run` prints
every stage, gate and `gh` write command, and exits without spawning an agent or changing GitHub.

```
 0 request    orchestrator   --prompt only: reads the prompt, .doc/sut-overview.md and .doc/sut/<area>.md
                             (when it exists), and drafts .orchestrate/request-draft.md in the
                             test-request format. Each criterion the prompt does not state is marked
                             "(inferred)"
                             ↳ the intake parser accepts the draft; at least one numbered criterion
 ✋ Gate 0    owner          edit the draft, confirm or delete each inferred criterion, and approve. The
                             driver refuses a draft that still has an "(inferred)" mark, files it with
                             gh issue create --label test-request,area:<area>, adds the backlog line,
                             and continues as --issue <n>. From here, prompt and issue runs are the same
   intake     driver         gh issue view --json → .orchestrate/request.json (zod: story, ACs, area, roles)
                             branch test/<area>; preflight: clean tree, gh auth status, settings valid,
                             host allowlisted, dev health check, fresh .auth/
 1 scope      orchestrator   .plan/NNN draft + .orchestrate/task-graph.json
                             ↳ task graph schema; every AC assigned to an area
 2 plan tests test-planner   Playwright MCP exploration → .doc/sut/<area>.md → .test/<area>/test-plan.md + execution-plan.md
                             ↳ both parse; every AC covered or deferred; invalid → back, ≤2
 ✋ Gate A    owner          approve plan, test plan, execution plan and any deferred AC → Status: active
                             driver posts the links on the request issue (gh issue comment)
 3 framework  framework-architect
                             only if the task graph needs it: interfaces first, plus unit tests
                             ↳ gate subset: tsc, eslint, vitest
 4 implement  test-developer-ui ∥ test-developer-api (disjoint paths)
                             framework request → framework-architect → resume, ≤2
 5 gate       driver         tools/gates on the combined tree → .orchestrate/gate.json
 6 review     code-reviewer  findings + gate failures → owning agent → re-gate → re-review, ≤2 rounds,
                             then escalate to the owner with the open findings
 7 run        driver         setup → smoke (entry) → area profile → new cases × newCaseRepeat → .orchestrate/runs/<run-id>/
 8 classify   driver rules   env issue: health check fails, dev returns 5xx or a challenge page, connection errors
                             flaky: the same case both passed and failed across repeats
                             anything else: untriaged
   triage     owner (phase 1) / failure-analyzer (phase 2)
                             labels each untriaged failure as test bug or product bug → failures.json
                             test bug → owning agent (≤2, assertion edits blocked) → gate → back to 7
                             env issue → health check + one rerun · flaky → quarantine proposal
                             product bug → bug draft .orchestrate/bugs/<case-id>.md (bug-report template)
                             ↳ untriaged = 0; every product bug has a draft
 ✋ Gate B    owner          for each bug draft: file it, keep it local (security-sensitive) or drop it;
                             approve or reject each quarantine proposal
 9 bugs       driver         secretlint on each approved draft, then gh issue create --label bug,area:<area>,
                             or gh issue comment when an open issue already exists for that case.
                             Lists the bug issues on the request issue. The owner quarantines each
                             product-bug case against its issue (.test/quarantine.md + @quarantine tag)
                             ↳ area exit criteria met over the cases that are not quarantined
 ✋ Gate C    owner          approve commit + PR
10 deliver    driver         commit (Conventional Commit) → regression profile → gh pr create --body-file
                             (Closes #<request>, lists the bug issues) → gh issue comment on the request
                             issue with the PR link. Merge stays manual
```

Each agent stage runs through the Claude Agent SDK. The driver passes the role in the
environment, loads the project settings so the hooks apply, sets a per-stage turn and dollar cap,
and asks for a JSON summary that it validates with zod. That summary only routes the loop. Pass
or fail always comes from the gate and the test run. Cost and duration per stage go to
`.orchestrate/trace.json`.

### Bug issues

A product bug is a failure that the owner (phase 1) or the failure-analyzer (phase 2) traced to
TClock rather than to the test. Each one becomes a GitHub Issue in this repository. The TClock team
is never contacted (see Access).

- **Draft.** Driver code renders `.orchestrate/bugs/<case-id>.md` from
  `.github/ISSUE_TEMPLATE/bug-report.md`. No agent writes it in phase 1; in phase 2 the
  failure-analyzer adds root-cause evidence to it before Gate B.
  - Title: `[<CASE-ID>] <failing step>: <actual result>`.
  - Case ID, area, role, request issue, run ID, date, and environment (dev host, Chromium, `he-IL`).
  - Steps and Expected, copied from the case's row in `.test/<area>/test-plan.md`.
  - Actual: the failing step and the error message from `failures.json`.
  - Evidence: the run ID and the local trace path. Traces and screenshots are never uploaded,
    because traces hold session cookies and screenshots can show company data.
- **Filing.** Only after the owner approves the draft at Gate B, and only if `secretlint` passes on
  it. The driver first searches open bugs for the same case ID
  (`gh issue list --label bug --state open --search "<CASE-ID> in:title" --json number,title`). On a
  hit, it adds the new run as a comment instead of filing a duplicate.
- **Security-sensitive findings** are never filed, whatever the repository's visibility. They stay
  as local drafts in `.orchestrate/bugs/`.
- **After filing.** The owner quarantines the case against its issue, so the exit criteria and the
  regression profile skip it. The bug issue stays open after the PR merges. When TClock fixes the
  bug, the owner removes the quarantine entry and tag, and closes the issue once the case passes
  again.

### The validated pull request

The driver fills `.github/pull_request_template.md` from files the loop produced. No agent writes
the evidence.

| Evidence (guide) | Source | In v1 |
|---|---|---|
| CI results | `gate.json` and the regression run's `summary.json`. Once CI exists, the GitHub Actions checks on the PR, read with `gh pr checks` | Local results, labelled "local run" with the run ID |
| Allure evidence | The run's `allure-results/`: a summary in the PR body (passed / failed / flaky per case) and the full report | Full report built locally with `npm run report`; a GitHub Actions artifact once CI exists, fetched with `gh run download` |
| Coverage report | `.orchestrate/coverage-report.md`: requirement → cases → tests → last result, plus planned vs automated per area | Same |
| Bug issues | The issues filed in stage 9, each with its case ID, plus a count of local-only drafts | Same |
| Human approval | Gate C (commit + PR) and the owner's merge | Same |

The PR body also says `Closes #<request>`, lists each review finding with how it was resolved,
and lists any quarantine change. The driver opens the PR with `gh pr create --body-file` and links
it on the request issue with `gh issue comment`.

### Non-negotiable rules and how code enforces them

| Rule | Enforcement (code, not prompts) |
|---|---|
| 1. Never change an assertion just to make a test pass | `tools/gates/integrity.ts` fails when the diff against the merge base edits or removes an `expect(` line in a spec that already exists on `main`. Only the owner can pass `--allow-assertion-change`; the driver never does |
| 2. Never skip a failing test silently | ESLint `playwright/no-skipped-test` and `no-focused-test`; the gate also bans `test.fixme` and `test.fail`. `@quarantine` is allowed only for case IDs listed in `.test/quarantine.md`, which no agent can write |
| 3. Validate generated code automatically | `tools/gates`: `tsc`, ESLint, Prettier, `playwright test --list`, Vitest, traceability and AC coverage, integrity, config guard, `secretlint` |
| 4. Least privilege | Per-role write paths, secret-file block, destructive-bash block (including `gh` for every agent role, and `gh pr merge` / `gh repo delete` for everyone), target-host allowlist (all hooks); restricted `tools:` in each agent's frontmatter; Playwright MCP limited to the dev origin |
| 5. Keep the automation deterministic | ESLint `no-restricted-imports` bans `@anthropic-ai/*`, `openai`, and any import from `tools/` in `src/` and `tests/` |
| Specs use the framework, not raw Playwright | ESLint override for `tests/{ui,api,e2e}`: no `page.locator`, `getBy*`, `request.*`, `waitForTimeout` or Hebrew string literals |
| Agents cannot loosen the rules | Config guard: `retries` must be 0 and `tsconfig` must stay `strict`. `tools/` and `eslint.config.js` are outside every role's write paths |

## Assumptions

SUT facts (black-box observations from the served client code, 2026-10-11 and rechecked
2026-10-16):
- `dev.tclock.co.il` is a live Vite dev server. It may restart or change without notice.
- Roles are `admin`, `operator` and `user`. The screen areas are admin-only, company management
  (admin and operator), and user (everyone). The access mode is `full` or `reports_only`.
- Same-origin cookie session: 15 min idle timeout, 5 h absolute, reported in `X-Web-Session-*` headers.
- Login is phone + passkey: `/web/auth/start` returns `enroll` or `login`, then `/web/auth/verify`.
  The client shows no OTP or SMS step.
- An operator can provision users (`operator` and `user` roles), branches and work-report
  locations. Nothing can be deleted, only deactivated.
- The app has no `data-testid`s. Locators use role and accessible name, in Hebrew.
- The owner's own operator passkey stays on the owner's device. Automation never uses it.
- The app's served source may be read to understand behaviour. It is never copied into this repo.

References:
- The guide's architecture and repository layout are the target. `itac-arena-qa-automation` is a
  read-only reference for class patterns. Its code is ported by hand, and its `.env` is never read.
- The owner owns the requests (user story and acceptance criteria). From a prompt, the
  orchestrator only drafts them, marks every criterion the prompt did not state as inferred, and
  nothing runs until the owner approves the draft at Gate 0. After that, no agent adds or changes
  an acceptance criterion; the test planner can only add `risk` cases and propose deferrals.

Workstation (checked 2026-10-16):
- Node 24.20 LTS and GitHub CLI 2.102 are installed (winget). `gh auth login` is still to do.
- The hooks are ESM `.js` files. Until `package.json` declared `"type": "module"`,
  `enforce-agent-boundaries.js` crashed with exit 1, which Claude Code treats as non-blocking:
  the per-role write guard enforced nothing. Step 1 fixed this, and `tests/unit/hooks/` keeps
  it fixed.
- Claude Code CLI 2.1.292 is installed. The Agent SDK needs Claude credentials, either an API key
  or the existing Claude Code login.
- The repository has no commits yet. The untouched template is staged on the unborn branch
  `chore/qa-foundation`, waiting for the owner's baseline commit (Q6); the foundation's files
  are untracked on top of it.
- The passkey spike succeeded for the QA Operator (`.doc/sut/auth.md`). The QA Employee is
  not provisioned yet.

## Open Questions

Answered by the owner on 2026-10-16: every recommendation below is accepted. Q6 is pending:
the GitHub repository and the baseline commit wait for the owner.

1. **How does the driver run agents?**
   - *Recommended:* the **Claude Agent SDK for TypeScript** (`@anthropic-ai/claude-agent-sdk`,
     `query()`). Use `settingSources: ["project"]` so the hooks and `CLAUDE.md` load,
     `env: { ...process.env, AGENT_ROLE }` for the boundary hook, an `outputFormat` JSON schema per
     stage, and `maxTurns` / `maxBudgetUsd` as caps. Fallback: headless `claude -p --output-format json`,
     which runs the same harness and hooks but returns less structured output.
2. **Parallel lanes: one shared working tree or git worktrees?**
   - *Recommended:* a **shared tree** with hook-enforced disjoint paths in v1. Worktrees need lane
     commits before Gate C, which the git rule forbids. Revisit if lanes ever need the same files.
3. **Should we install Playwright's built-in agents (`npx playwright init-agents`)?**
   - *Recommended:* **no, borrow from them instead.** Use their Playwright MCP server for the
     test planner's exploration (`--isolated`, `--storage-state .auth/<role>.json`,
     `--allowed-origins https://dev.tclock.co.il`), and use their agent prompts as reference text.
     Their generator puts raw locators in specs, and their healer edits failing tests in place.
     Both break rules 1 and 2 and the page-object layering.
4. **Directory names: the guide's plurals (`pages/`, `components/`, `clients/`, `schemas/`) or this
   repo's singular-name rule?**
   - *Recommended:* keep **the guide's directory names** for collections, and use singular names
     for entity files (`user-client.ts`, `branch-page.ts`). `naming.md` will say so explicitly.
5. **Which phone numbers do the QA users get?** The backend may send invites or reminders.
   - *Recommended:* only numbers you own for the two long-lived QA users (`QA Operator`,
     `QA Employee`). Use generated numbers for per-test users only after the spike confirms
     provisioning sends nothing.
6. **GitHub repository and baseline commit?** Intake, PRs and the integrity check need a GitHub
   repository and a `main` to diff against.
   - *Recommended:* create the repo with `gh repo create` and send its `owner/name`, then approve one baseline commit of
     the current template on `main` before `chore/qa-foundation` branches off. Whatever the
     visibility, security-sensitive findings stay local drafts.
7. **Branch prefix for test work?** The git rule only allows `feat|fix|chore|docs`.
   - *Recommended:* add `test/<area>` for suite work done by the loop. Framework work keeps the
     existing prefixes.
8. **Where do exported passkey credentials live?**
   - *Recommended:* `.auth/passkey.<role>.json`, gitignored and blocked by the secret hook. Move
     them to a GitHub Actions secret when CI arrives.
9. **Who quarantines a case after its bug issue is filed?**
   - *Recommended:* **the owner, by hand, in v1**: one `.test/quarantine.md` entry linking the bug
     issue, plus the `@quarantine` tag on the case. Quarantine stays owner-written, and it happens
     rarely. Once bug filing is routine, the driver can write both after Gate B.

## Steps

0. **Prerequisites (owner)**
   - Install Node 24 LTS and the GitHub CLI (`winget install GitHub.cli`, then `gh auth login`).
   - Create the GitHub repository with `gh repo create` and approve the baseline commit on
     `main` (Q6).
   - Create the `test-request` and `bug` labels with `gh label create`. The driver creates
     `area:<area>` labels as it needs them.
   - Create the branch `chore/qa-foundation`.
1. **Make the guardrails enforce again**
   - Add a minimal `package.json` with `"type": "module"` so the ESM hooks load.
   - Pipe a crafted payload into `enforce-agent-boundaries.js` and confirm it exits 2.
2. **Restructure the AI context**
   - `AGENTS.md`: the shared contract the guide describes. It covers the stack, the layout
     (including `.test/` and `tools/`), the existing abstractions, the validation commands, the
     prohibited operations and the skill table. Keep the "Hopa!" rule.
   - Rules (the guide's coding standards):
     - Keep `code-style.md`.
     - Rewrite `naming.md`: TClock's own term `company` (never `org`, `organization` or
       `tenant`); keep `geo` / `lat` / `lng`; kebab-case files (`*-page.ts`, `*-client.ts`,
       `*.spec.ts`); the guide's directory names; IDs `<AREA>-AC-NN` and `<AREA>-<LAYER>-NNN`.
     - Update `git-workflow.md`: Conventional Commits, the `test/` prefix, Gates 0/A/B/C.
     - Delete `ui-and-styling.md`.
     - Add `locator.md`: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText`; no XPath;
       locators only in page objects; Hebrew only in label maps.
     - Add `waiting-and-flakiness.md`: web-first assertions; `waitForResponse` for API-backed
       actions; no sleeps; retries 0; quarantine only through `.test/quarantine.md`.
     - Add `test-data.md`: set up through API clients, not the UI; prefix `qa-<runId>-`;
       deactivate on teardown; never touch unprefixed entities.
     - Add `sut-safety.md`: dev host only; no load testing or fuzzing; never vendor app source;
       security findings never public.
     - Add `test-integrity.md`: the five non-negotiable rules, each pointing at the check that
       enforces it.
   - Skills:
     - Keep `cutting-a-release`.
     - Adapt `writing-plans`: drop the frontend/backend scope rule; implementation plans link
       their request issue and their area's `.test/` files instead of embedding test cases.
     - Rewrite `writing-tests` for this framework: spec structure, `test.step`, case annotation
       and tags, `expect` vs `expect.soft`, how to file a framework request.
     - Add `writing-test-plans` (requirements and cases tables, design techniques, risk-based
       priority, layer choice), `exploring-the-sut`, `passkey-auth`, `adding-a-page-object`,
       `adding-an-api-client` and `reviewing-code` (checklist, severity scale, report format).
     - Delete `database-schema` and `error-handling`.
   - Agents: replace `.claude/agents/*` with `orchestrator.md`, `test-planner.md`,
     `framework-architect.md`, `test-developer.md` and `code-reviewer.md`. Each lists its
     responsibility, allowed tools, inputs, deliverable and completion criteria.
   - Hooks and settings:
     - Remap the roles in `enforce-agent-boundaries.js` and add the "no role writes" list.
     - Extend `block-destructive-bash.js`: block every `gh` command when `AGENT_ROLE` is set,
       and block `gh pr merge`, `gh repo delete` and `gh release create` for everyone (merges
       and releases stay manual).
     - Extend `block-secret-file-access.js` to `.auth/**` and `passkey*.json`.
     - Add `enforce-target-allowlist.js`: block any Bash or WebFetch call that touches a
       `tclock.co.il` host other than `dev.tclock.co.il`.
     - In `settings.json`, replace the figma/linear MCP entries with the Playwright servers,
       update the deny list, and wire the new hook.
     - Add `.mcp.json` with one Playwright MCP server per role (Q3 flags).
   - GitHub:
     - `.github/ISSUE_TEMPLATE/test-request.md`: fixed headings for the user story, numbered
       acceptance criteria, area, roles involved, out of scope and links. It is a Markdown
       template rather than a YAML issue form, so it works from the terminal with
       `gh issue create --template "Test request"`, and the intake parser reads fixed headings.
     - `.github/ISSUE_TEMPLATE/bug-report.md`: fixed headings for the case ID, request issue,
       environment, steps, expected, actual and evidence (run ID and local trace path only). The
       driver renders bug drafts from it, and the owner can also use it by hand.
     - `.github/pull_request_template.md`: request (`Closes #<n>`), coverage report, CI results,
       Allure summary, bug issues, review findings, quarantine changes, approval.
     - `copilot-instructions.md` stays as it is.
   - Docs:
     - Rewrite `product-definition.md` for this QA project, with acceptance criteria that map
       to the Validation commands.
     - Add `sut-overview.md`; fill in `architecture.md` (with the Architecture diagram above)
       and `glossary.md`; rewrite `README.md`.
     - The `.cursor/` pointer stays as it is.
3. **Create `.test/`**
   - `README.md`, `master-test-plan.md` (the guide's test strategy), `execution-plan.md` (the
     profiles above) and an empty `quarantine.md`.
   - `auth/test-plan.md` and `auth/execution-plan.md` as the reference example. The Requirements
     table holds the smoke criteria from step 10, with this plan as their source. The Test Cases
     table holds the step 10 cases.
4. **Scaffold the TypeScript project**
   - Dependencies: `@playwright/test`, `zod`, `dotenv`, `exceljs`; dev: `typescript`, `tsx`,
     `vitest`, `allure-playwright`, `allure`, `eslint`, `typescript-eslint`,
     `eslint-plugin-playwright`, `prettier`, `husky`, `lint-staged`, `@commitlint/cli`,
     `@commitlint/config-conventional`, `secretlint`, `@anthropic-ai/claude-agent-sdk` (used by
     `tools/` only).
   - `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, ESM and bundler resolution.
   - `playwright.config.ts`:
     - projects `setup` → `ui`, `api`, `e2e`, all on Chromium with Hebrew pinned;
     - `retries: 0`, `trace: 'retain-on-failure'`;
     - reporters: list, JUnit, `allure-playwright`, with output under `.orchestrate/runs/<run-id>/`.
   - `eslint.config.js` with the rule overrides from the rules table.
   - Prettier with `semi: false`.
   - husky: `pre-commit` runs lint-staged (ESLint, Prettier, `tsc`, `secretlint`); `commit-msg`
     runs commitlint.
   - npm scripts: `typecheck`, `lint`, `format`, `test:unit`, `test:setup`, `test:smoke`,
     `test:area`, `test:regression`, `gate`, `report`, `loop`.
   - `.gitignore`: `node_modules/`, `.env`, `.auth/`, `test-results/`, `playwright-report/`,
     `allure-results/`, `allure-report/`, `.orchestrate/*` except its README.
5. **Config and safety** (`src/config/`)
   - `settings.ts` validates the environment and rejects any `BASE_URL` outside the allowlist.
     The `setup` project calls it before any page opens.
   - `enum.ts`.
   - `.env.example` lists every variable.
6. **Passkey auth spike** (everything after this step depends on it)
   - The owner provisions a `QA Operator` user in the UI.
   - Automation opens `/login` with a CDP virtual authenticator (ctap2, internal, resident key,
     user verification) and enrolls that user.
   - It exports the credential with `WebAuthn.getCredentials` to `.auth/passkey.operator.json`.
   - A fresh context imports it with `WebAuthn.addCredential` and logs in.
   - The QA Operator provisions `QA Employee`, and the same flow runs for that user.
   - Findings, including the observed `/web/*` session endpoints, go to `.doc/sut/auth.md`.
7. **Fixtures and the setup project** (the `conftest.py` equivalent)
   - `tests/setup/auth.setup.ts` writes `.auth/operator.json` and `.auth/employee.json` once per run.
   - `tests/fixtures.ts` provides:
     - `operatorPage` and `employeePage`, with the Hebrew init script;
     - `operatorApi` and `employeeApi`, `APIRequestContext`s built from the same storage state;
     - `runId` and `cleanup`.
   - `case` annotations become Allure ID labels.
8. **UI and API layers, with itac-arena's patterns**
   - `src/api/base-client.ts`, then `clients/session-client.ts` with its schema in `schemas/`.
   - `src/ui/base-page.ts` and the generic `components/mui/`.
   - `src/ui/pages/tclock-base-page.ts`, the navbar and re-auth dialog components, and the login
     and home pages with their `labels/`.
   - Matchers `toBeAccessDenied` and `toShowSnackbar` in `src/assertions/`; `date-utils` and
     `file-utils` in `src/utils/`.
9. **Data layer** (`src/data/`)
   - Builders for user, branch and work-report location.
   - A cleanup registry that deactivates everything created in the run.
   - A typed `test-data/` loader.
10. **Smoke cases**, as defined in `.test/auth/test-plan.md`, tagged `@smoke @auth`:
    - `AUTH-UI-001` the operator logs in and sees the management navbar.
    - `AUTH-UI-002` the employee logs in and is denied a company-management route.
    - `AUTH-UI-003` logout clears the session.
    - `AUTH-API-001` the session endpoint reports the operator role for the operator's cookies.
    - `AUTH-API-002` an unauthenticated call to a company-management endpoint is rejected.
    - The step 6 spike confirms the exact endpoints for the two API cases.
11. **Quality gate** (`tools/gates/`)
    - Runs every check in the rules table and writes `.orchestrate/gate.json`. The exit code is
      the verdict.
    - Includes the parsers for both `.test/<area>/test-plan.md` tables and the execution-plan
      front matter.
    - Builds `.orchestrate/coverage-report.md` from the test plans, `playwright test --list
      --reporter=json` and the latest run's results.
    - Every check has positive and negative unit tests.
12. **Dev-loop driver** (`tools/dev-loop/`), one module per architecture box, in loop order:
    - `github`: the single wrapper around the GitHub CLI. No other module calls `gh` or the
      GitHub API.
      - Reads ask for `--json` and parse the output with zod: `gh auth status`, `gh issue view`,
        `gh issue list`, `gh pr checks`.
      - Writes take `--body-file` and parse the URL that `gh` prints, because these commands have
        no `--json`: `gh issue create`, `gh issue comment`, `gh label create --force`,
        `gh pr create`.
      - `gh run download` fetches CI artifacts once CI exists.
      - Under `--dry-run`, every write is printed instead of run.
    - `request` (stage 0, `--prompt` only): runs the orchestrator to draft
      `.orchestrate/request-draft.md`, validates it with the intake parser, stops at Gate 0, then
      files the approved draft as the request issue and adds its backlog line.
    - `intake`: issue template parser → `request.json`. `--issue`, `--next` and `--prompt` all end
      here, and `--request-file` reads a local fixture for offline runs and tests.
    - Stages 1–6 and Gate A as described in Scope, with the task-graph schema, loop state with
      `--from-stage`, `--dry-run`, per-stage caps and the trace.
    - `runner` and `classify` (stages 7–8): the run profiles, the classification rules,
      `failures.json`. Classification stays in owner-triage mode until the phase 2 analyzer
      exists: the driver shows each untriaged failure with its error and trace path, and the
      owner labels it test bug or product bug.
    - `bug` (stage 9): renders a draft from the `bug-report` template for each product bug, stops
      at Gate B, runs `secretlint` on the approved drafts, then files them (or comments on the open
      issue for the same case) and lists them on the request issue.
    - `pr` (stage 10): renders the PR template from the evidence files, commits after Gate C, runs
      the regression profile, opens the PR with `gh pr create --body-file`, and comments on the
      request issue.
13. **Seed the backlog**, highest risk first: one request per area, which the owner creates with
    `gh issue create --template "Test request"` (or `npm run loop -- --prompt`, which files it at
    Gate 0) and links from `.plan/000-backlog.md`.
    1. `auth`: session expiry and the re-auth dialog. This is the first real loop run.
    2. `employee-report` lifecycle: the employee edits and submits; the operator reviews,
       approves and locks it, or returns it for editing.
    3. `payroll-hours`: preview plus Excel export (parse the download and assert on it).
    4. `user`: provision, edit, deactivate.
    5. `branch`: create (code availability and suggestion) plus policies.
    6. `work-report-location`: create (address lookup, map, radius).
    7. `absence` reporting: hours, half day, full day, date range.
    8. `company-policy` and `punch-clock-configuration` (`@serial`, company-wide state).
    9. `daily-attendance` and `period-summary`.
    10. Role access matrix: role × route and API.
    11. Public pages smoke: home, privacy, support.
    12. **Phase 2:** `.claude/agents/failure-analyzer.md` with the `triaging-a-failure` and
        `writing-a-bug-report` skills, once two areas finish the loop without manual repair.
    13. CI: GitHub Actions workflows in `.github/workflows/` calling `tools/gates` and the run
        profiles, publishing JUnit and the Allure report as artifacts.

## Validation

Each item is a command or test with a pass/fail result:

- [ ] `npm ci` succeeds on a clean clone with Node 24.
- [ ] `npm run typecheck`, `npm run lint` and `npx prettier --check .` each exit 0.
- [ ] `npx playwright test --list` lists every test with zero errors, with no `.env` present.
- [ ] `npm run test:unit` passes. It covers:
  - the settings guard, `runId`, and passkey (de)serialisation;
  - `BaseClient` status checks;
  - the issue-template parser, both test-plan table parsers, and the execution-plan parser;
  - the request draft: a recorded orchestrator draft parses into `request.json`; a draft without
    a numbered criterion is rejected, and so is a draft that still has an "(inferred)" mark;
  - the `github` wrapper, against recorded `gh --json` output and printed-URL fixtures;
  - traceability and AC coverage, integrity, and the config guard;
  - the failure classifier: fixture runs yield `env`, `flaky` and `untriaged`;
  - the bug renderer: a fixture failure plus the `auth` test plan yields a draft with the case's
    Steps and Expected, the error as Actual, and the run ID, and with no cookie value or trace
    content;
  - the duplicate check: a recorded `gh issue list` hit for the same case ID turns the filing
    into a comment;
  - the PR renderer: the fixture evidence yields all five evidence sections and `Closes #<n>`;
  - the hooks.
- [ ] `npm run gate` exits 0 and writes `.orchestrate/gate.json` and
      `.orchestrate/coverage-report.md`. The coverage report shows every `AUTH-AC-*` as covered and
      all five auth cases as automated.
- [ ] Each negative gate fixture in `tests/unit/gates/` makes its check fail:
  - a spec that calls `page.getByRole`;
  - a Hebrew string literal in a spec;
  - `test.skip`;
  - `@quarantine` with no registry entry;
  - a case ID that is not in the test plan;
  - a `planned` case with no test;
  - a requirement that no case covers and that is not deferred;
  - a case whose `Covers` names an unknown requirement ID;
  - an edited `expect(` in a spec that exists on `main`;
  - a duplicate case ID in a test plan;
  - `retries: 1` in the Playwright config.
- [ ] An `@anthropic-ai/sdk` import in a file under `src/` or `tests/` fails `npm run lint`.
- [ ] `BASE_URL=https://tclock.co.il npx playwright test --project=setup` exits non-zero with the
      settings error before any page opens.
- [ ] `npx playwright test --project=setup` creates `.auth/operator.json` and `.auth/employee.json`,
      and `git check-ignore .auth/operator.json` matches.
- [ ] After one `npm run test:setup`, `npm run test:smoke -- --no-deps --repeat-each=3` passes
      15 of 15 runs without logging in again. `--repeat-each` would otherwise repeat the setup
      project too, so the driver always runs setup as its own step.
- [ ] `npm run report` builds an Allure report that shows case IDs and tags.
- [ ] The hook tests in `tests/unit/hooks/` pass:
  - `enforce-target-allowlist.js` exits 2 on `curl https://tclock.co.il/`;
  - `block-secret-file-access.js` exits 2 on `.auth/operator.json`;
  - `block-destructive-bash.js` exits 2 on `gh pr merge 1` for everyone, and on `gh issue list`
    when `AGENT_ROLE` is set;
  - `enforce-agent-boundaries.js` exits 2 for `test-developer-ui` writing to `src/` or
    `tests/api/`, for `framework-architect` writing to `tests/ui/`, and for any role writing to `.test/quarantine.md`,
    `.github/` or `tools/gates/`.
- [ ] `echo "bad message" | npx commitlint` exits non-zero, and `npx lint-staged` passes on the
      staged tree.
- [ ] `npm run loop -- --request-file tests/unit/fixtures/test-request.md --dry-run` writes a valid
      `.orchestrate/request.json`, prints every architecture box with its stage and gate, reads the
      `.test/auth/execution-plan.md` front matter, validates a sample task graph, prints the `gh`
      write commands of stages 9 and 10, and exits 0 without spawning an agent or calling a `gh`
      write command.
- [ ] `npm run loop -- --prompt "test the auth session expiry" --dry-run` prints stage 0, Gate 0
      and the `gh issue create` command it would run, and exits 0 without spawning an agent.
- [ ] `gh auth status` succeeds. `npm run loop -- --prompt "<the auth session-expiry request>"`
      stops at Gate 0 with a draft that parses. After approval,
      `gh issue view <n> --json labels` shows `test-request` and `area:auth`, and the run
      continues to intake and writes a valid `.orchestrate/request.json`.
- [ ] Every acceptance criterion in `.doc/product-definition.md` names one of the commands above.

## Risks

| Risk | Mitigation |
|---|---|
| The virtual authenticator can't enroll (for example, the backend requires prior mobile-app registration) | The spike runs first. Fallback: a one-time headed login with a real platform passkey, saving storage state (valid for at most 5 h, re-bootstrapped each session). Documented in the `passkey-auth` skill |
| Cloudflare challenges headless Chromium | The preflight health check detects a challenge page. Fallback: headed runs or the `chrome` channel. Keep request rates low |
| The dev server restarts or changes mid-run | Health check in preflight and smoke as the entry criterion. The classifier marks these failures as env issues, not product bugs |
| Vague acceptance criteria in a request | The intake schema requires at least one numbered criterion. The test planner lists ambiguities in the test plan, and the owner resolves them at Gate A |
| Agents game the gates (weaken an assertion, skip a test, widen a selector, loosen config) | The integrity check and config guard, the owner-only quarantine registry, `tools/` outside every role's write paths, and the code-reviewer checklist |
| Requirements, test plans and code drift apart | Coverage and traceability checks on every gate run. Automation status and results are computed, never hand-edited |
| Parallel lanes collide in the shared tree | Disjoint write paths enforced by the hook. Shared files belong to the framework architect; lanes request changes instead of making them |
| Exploration reaches beyond dev | Playwright MCP `--allowed-origins`, plus the target-host hook for Bash and WebFetch |
| Hebrew copy changes break locators | `src/ui/labels/` holds every string in one place. The test planner re-captures them when they drift |
| Data piles up (no delete endpoints) | `qa-<runId>-` prefix, deactivation on teardown, and a manual housekeeping script for leftovers |
| Session timeouts (15 min idle, 5 h absolute) | The setup project runs at the start of every run, and the driver refreshes `.auth/` before exploration. Clients detect a 401 and log in again once |
| Company-wide settings race between parallel tests | `@serial` tag, run with `--workers=1`, declared in the area execution plan |
| Public disclosure of another product's weaknesses | Security-sensitive findings never become issues and stay local drafts |
| From a prompt, the orchestrator drafts a criterion the owner did not mean | Inferred criteria are marked, and nothing runs until the owner approves the draft at Gate 0. The filed issue stays the record, and the owner can edit it |
| A bug issue leaks session or company data | Drafts are built only from the test plan and the error message. Traces and screenshots are never uploaded, and `secretlint` runs on every draft before filing |
| The same bug is filed again on every run | The driver searches open `bug` issues for the case ID before filing; a hit becomes a comment |
| A known product bug keeps the area red | The case is quarantined against its bug issue, and the exit criteria count only cases that are not quarantined |
| Agent cost and runtime | Opus for judgement roles, sonnet for implementation roles; at most 2 repair rounds; `maxBudgetUsd` per stage; cost per stage recorded in `trace.json` |

## Rollout Order

1. Step 0 (owner prerequisites).
2. Steps 1–3 on `chore/qa-foundation`: guardrails, AI context, `.test/`. Commit after your approval.
3. Steps 4–5: scaffold, config, safety.
4. **Step 6 spike.** Stop and report. If enrollment fails, revise this plan before going on.
5. Steps 7–10: framework and smoke, proven end to end on the UI and API layers.
6. Step 11: the quality gate and coverage report.
7. Step 12: driver dry runs from a request fixture and from a prompt, then one real loop started
   from a prompt for the `auth` session-expiry request, through to a validated PR and a bug issue
   for each product bug it finds.
8. Step 13: seed the backlog with request issues, open the foundation PR, and merge after your approval.

## Rollback

- In TClock, this plan creates only the two QA users and `qa-`-prefixed entities in your sandbox
  company. Rolling back there means deactivating them through the operator UI.
- Each step lands on `chore/qa-foundation` as its own commit, so any step can be reverted.
  Nothing reaches `main` without your merge approval.
- On GitHub, the loop only adds request issues, bug issues, comments, labels and pull requests,
  each after an owner gate. Rolling back means closing them with `gh issue close` or
  `gh pr close`; the loop never deletes anything on GitHub.
- If the passkey spike fails and no fallback works, this plan is revised around a manual
  session bootstrap before any framework work continues.
