# Agent Instructions

## communication with me
- Please start all your responses with Hopa!

## What this repository is
AI-orchestrated QA automation for TClock (`https://dev.tclock.co.il`), a Hebrew/RTL attendance
and payroll app with passkey login. A TypeScript + Playwright Test framework, a `.test/` layer
that traces every test to a requirement, and a multi-agent dev loop (`tools/dev-loop`) whose
work is accepted only by deterministic gates (`tools/gates`).

## Security
- Never commit or expose secrets (tokens, API keys, passwords, cluster credentials, secret values).
- `.env`, `.auth/` and `passkey*.json` are secrets: never read, print, copy or attach them.
- Traces, screenshots and storage state stay local. Security-sensitive findings never go to a
  GitHub issue, a PR or a commit.

## Guardrails (Single Source of Truth)
- Guardrail logic lives in `.claude/hooks/`. It is wired into the runtime by
  `.claude/settings.json`, which is the only location Claude Code reads hook and
  permission config from. A hook script that is not listed there never runs.
- Do not duplicate permission or hook rules in other agent docs.
- If any instruction conflicts with the hooks, the hooks win.
- `tools/dev-loop` sets `AGENT_ROLE` for every agent it spawns. The hooks use it to enforce
  per-role write paths (`.claude/hooks/lib/role-write-paths.js`, the single list both the hook
  and the driver read) and to block `gh` and git writes for agents.

## Stack
Node 24 (ESM, `"type": "module"`), TypeScript 6 (`strict`), Playwright Test 1.64 (Chromium,
`he-IL`, `Asia/Jerusalem`), zod, Vitest, ESLint + typescript-eslint + eslint-plugin-playwright,
Prettier (no semicolons), allure-playwright, secretlint, husky + lint-staged + commitlint,
the Claude Agent SDK (in `tools/` only), Playwright MCP (test-planner exploration), GitHub CLI.

## Repository layout
- `.doc/`: product definition, SUT overview, architecture, glossary; `.doc/sut/<area>.md` holds
  exploration notes.
- `.test/`: what we test and how we run it. `master-test-plan.md`, `execution-plan.md`,
  `quarantine.md` (owner-only), and `<area>/test-plan.md` + `<area>/execution-plan.md`.
- `.plan/`: `000-backlog.md` is the queue; `NNN-YYYY-MM-DD-*.md` are implementation plans.
- `.orchestrate/`: everything the loop generates (request, task graph, reports, `gate.json`,
  `coverage-report.md`, `runs/<run-id>/`, bug drafts, `trace.json`). Gitignored.
  Never create a `docs/` directory.
- `src/`: the framework. `config/`, `ui/` (base page, `pages/`, `components/`, `labels/`),
  `api/` (base client, `routes.ts`, `clients/`, `schemas/`), `auth/`, `data/`, `assertions/`,
  `utils/`.
- `tests/`: `fixtures.ts`, `setup/`, `ui/<area>/`, `api/<area>/`, `e2e/<area>/`, `unit/`.
- `test-data/{ui,api}/<area>.json`: static inputs.
- `tools/`: owner-only. `gates/` (the quality gate), `dev-loop/` (the driver), `auth/enroll.ts`.
- `.claude/`: `agents/`, `hooks/`, `rules/`, `skills/`, `playwright-mcp/`. `.mcp.json`: one
  Playwright MCP server per QA role, dev origin only.
- `.github/`: the `test-request` and `bug-report` issue templates and the PR template.

## Abstractions to reuse
| Need | Use |
|---|---|
| A logged-in role | fixtures `operatorPage`, `employeePage`, `freshOperatorPage`, `operatorApi`, `employeeApi`, `anonymousApi` |
| Trace a test to its case | `testCase('<CASE-ID>', ...tags)` from `tests/fixtures.ts` |
| A screen | a page object extending `TClockBasePage`; Hebrew names in `src/ui/labels/` |
| An endpoint | a client extending `BaseClient`; paths in `src/api/routes.ts`; zod schemas |
| Wait for an action's API call | `BasePage.waitForApi(route, action)` |
| Test data | builders in `src/data/builders/` (`qa-<runId>-`) and the `cleanup` fixture |
| Shared assertions | `expect(...).toBeAccessDenied()`, `.toShowSnackbar(text)` |
| Settings | `loadSettings()`; it rejects any host but the dev host |

## Validation commands
| Command | Proves |
|---|---|
| `npm run typecheck` | types |
| `npm run lint` | ESLint, including the spec rules and the determinism bans |
| `npm run format:check` | Prettier |
| `npm run test:unit` | Vitest: framework, gate, driver, hooks |
| `npx playwright test --list` | every test collects (no `.env` needed) |
| `npm run gate` | the full quality gate → `.orchestrate/gate.json`, `coverage-report.md` |
| `npm run test:setup` then `npm run test:smoke -- --no-deps` | live smoke against dev |
| `npm run loop -- --request-file tests/unit/fixtures/test-request.md --dry-run` | the dev loop end to end, offline |

## Prohibited operations
- Committing, merging, pushing a tag, or opening a PR without the owner's explicit approval.
- `gh pr merge`, `gh repo delete`, `gh release create`, force pushes, `git reset --hard`,
  `rm -rf` (hooks block them for everyone).
- Any `gh` call or git write from an agent role.
- Any `tclock.co.il` host other than `dev.tclock.co.il`; load, fuzzing or scanning.
- Editing `tools/`, `.claude/`, `.github/`, `eslint.config.js`, `.test/quarantine.md`,
  `.test/master-test-plan.md`, `.test/execution-plan.md`, `.mcp.json` or this file as an agent.
- Changing an existing assertion to make a test pass, skipping a test, or adding retries.

## Rules: always in context
@.claude/rules/code-style.md
@.claude/rules/naming.md
@.claude/rules/git-workflow.md
@.claude/rules/locator.md
@.claude/rules/waiting-and-flakiness.md
@.claude/rules/test-data.md
@.claude/rules/sut-safety.md
@.claude/rules/test-integrity.md

## Skills: load when the task calls for it
| Skill | Use it when |
|---|---|
| `writing-plans` | Creating or revising a plan in `.plan/` |
| `writing-test-plans` | Writing `.test/<area>/test-plan.md` and `execution-plan.md` |
| `exploring-the-sut` | Exploring a TClock area with Playwright MCP; writing `.doc/sut/<area>.md` |
| `writing-tests` | Writing or reviewing a spec or a unit test |
| `adding-a-page-object` | Adding a page object, component or label map |
| `adding-an-api-client` | Adding an API client, route or schema |
| `passkey-auth` | Login, sessions, the setup project, enrollment |
| `reviewing-code` | Reviewing a diff; the code-reviewer stage |
| `cutting-a-release` | Choosing a version number or tagging a release |

## Product and domain
- This project's purpose, scope and acceptance criteria: `.doc/product-definition.md`.
- TClock itself (roles, areas, risks): `.doc/sut-overview.md`.
- Framework and agent architecture: `.doc/architecture.md`.
- Canonical domain terms: `.doc/glossary.md`. Add a new shared term there before using it.
- Keep these docs current when routes, roles, the framework's layers or the loop change.
