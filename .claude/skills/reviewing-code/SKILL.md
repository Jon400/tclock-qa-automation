---
name: reviewing-code
description: Review a change to this repository (framework, specs, test plans) and report findings with a severity and an owner. Use for the dev loop's code-reviewer stage, and whenever the owner asks for a review of a branch or a diff.
---

# Reviewing Code

The gate has already run: types, lint, formatting, test collection, traceability, assertion
integrity, the config guard and secrets. Do not repeat it. Review what no tool can judge.

## Checklist

**Test quality**
- Each test proves its case's Expected column, completely and only that. A visible page does
  not prove "the session ended"; a status code does not prove the data changed.
- Steps follow the case's Steps; `test.step` names match them.
- Tests are independent: no shared state, no order, no reliance on another test's data.
- Negative cases really reach the rule they test (the right role, the right input), and do not
  pass for an unrelated reason (a 404 instead of a 403).
- No conditional logic in tests; no assertion that can never fail.

**Architecture and layering**
- Specs use only fixtures, page objects, components, clients, builders and matchers.
- Nothing TClock-specific in `src/ui/base-page.ts`, `src/ui/components/mui/` or
  `src/api/base-client.ts`.
- Locators follow `.claude/rules/locator.md`; Hebrew only in label maps; routes only in
  `src/api/routes.ts`.
- Reuse over duplication: an existing page object, component or client method is extended,
  not copied.
- Naming follows `.claude/rules/naming.md` (`company`, never `org`; kebab-case files; IDs).
- Types are precise: no `any`, no unchecked casts of response bodies (parse with a schema).

**Waiting and data**
- Actions backed by API calls wait for the response; no sleeps, no polling without a deadline.
- Created data goes through builders (`qa-<runId>-`) and the `cleanup` fixture.
- `@serial` only for company-wide state; `@smoke` only for the small entry set.

**Safety**
- No host other than `dev.tclock.co.il`; no session value, phone number, ID number or real name
  in code, test data, plans or reports.
- No entity without the `qa-` prefix is read, changed or deactivated.
- A finding that is itself security-sensitive stays in the local report and is marked so.

**Plans** (when `.test/` changed)
- Every request criterion has a requirement row; deferrals have real reasons.
- Cases sit on the cheapest layer that proves them; priorities follow the master test plan.

## Severity

| Severity | Meaning | Effect |
|---|---|---|
| `blocker` | wrong or missing proof, broken layering, a safety problem, a test that can pass when the product is broken | fails the stage; goes back to its owner |
| `should-fix` | real but not harmful now: duplication, unclear naming, a weak step name | listed for the owner at Gate C |
| `nit` | taste | listed, never routed |

## Owner

The agent whose lane holds the file: `framework-architect` (`src/`, fixtures, setup, config,
unit tests), `test-developer-ui` (`tests/ui/`, `tests/e2e/`, `test-data/ui/`),
`test-developer-api` (`tests/api/`, `test-data/api/`), `test-planner` (`.test/<area>/`,
`.doc/sut/`).

## Report

`.orchestrate/review-report.md`:

```
# Review: <request title>, round <n>

Verdict: <n> blocker(s), <n> should-fix, <n> nit(s)

| ID | Severity | Owner | File:line | Finding | Suggested fix |
|---|---|---|---|---|---|
| R1 | blocker | test-developer-ui | tests/ui/auth/re-auth.spec.ts:20 | ... | ... |
```

Keep finding IDs stable across rounds: when you raise the same problem again, reuse its ID.
