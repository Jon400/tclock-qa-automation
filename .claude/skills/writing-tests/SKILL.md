---
name: writing-tests
description: Write or review a Playwright spec for a planned TClock test case (UI, API or E2E), or a Vitest unit test for framework and tooling code. Use when implementing cases from .test/<area>/test-plan.md, when a spec fails review, or when deciding how a case should be structured, tagged and asserted.
---

# Writing Tests

A spec implements exactly one planned case per test. The test plan
(`.test/<area>/test-plan.md`) says what to prove; the framework says how to reach the app.

## Where a test goes

| Layer | Folder | Fixtures |
|---|---|---|
| UI | `tests/ui/<area>/<topic>.spec.ts` | `operatorPage`, `employeePage`, `freshOperatorPage` |
| API | `tests/api/<area>/<topic>.spec.ts` | `operatorApi`, `employeeApi`, `anonymousApi` |
| E2E (several roles or layers) | `tests/e2e/<area>/<topic>.spec.ts` | any of the above |
| Unit (framework, gate, driver) | `tests/unit/<folder>/<topic>.test.ts` | Vitest; `import { describe, expect, it } from 'vitest'` |

Every role fixture is already logged in (the `setup` project saved the session). Use
`freshOperatorPage` only for a case that ends or changes its session, so the shared one stays valid.

## Shape of a spec

```ts
import { SessionClient } from '../../../src/api/clients/session-client'
import { HomePage } from '../../../src/ui/pages/home-page'
import { LoginPage } from '../../../src/ui/pages/login-page'
import { expect, test, testCase } from '../../fixtures'

test(
  'logout ends the session in the browser and on the server',
  testCase('AUTH-UI-003', '@smoke'),
  async ({ freshOperatorPage }) => {
    const home = await new HomePage(freshOperatorPage).open()

    await test.step('log out from the navbar', () => home.logout())

    await test.step('the login form is shown', async () => {
      await new HomePage(freshOperatorPage).visit()
      await expect(new LoginPage(freshOperatorPage).phoneInput).toBeVisible()
    })

    await test.step('the session call returns 401', async () => {
      const response = await new SessionClient(freshOperatorPage.request).requestSession(401)
      await expect(response).toBeAccessDenied()
    })
  }
)
```

- `test` and `expect` come from `tests/fixtures.ts`, never from `@playwright/test`.
- `testCase('<CASE-ID>', ...tags)` adds the `case` annotation the gate traces, the Allure ID,
  and the area tag (`@auth`). Extra tags: `@smoke`, `@serial` (company-wide state). Never
  `@quarantine`: only the owner quarantines.
- The title says the behaviour in plain words; the ID is in the annotation, not the title.
- One `test.step` per step of the case, named after it, so the bug report and Allure read
  like the plan.

## Assertions

- Prove the case's Expected column: every expected result has an assertion, and nothing
  weaker stands in for it (a visible page is not "the session ended").
- Web-first assertions only: `await expect(locator).toBeVisible()`, never
  `expect(await locator.isVisible()).toBe(true)`.
- Use the framework's matchers (`toBeAccessDenied`, `toShowSnackbar`) where they fit.
- `expect.soft` for independent checks on one screen, so one failure does not hide the next;
  `expect` for anything the next step depends on. API clients already check the status softly.
- Never change or remove an existing `expect(` line to make a test pass: the gate fails it.

## Data

- Static inputs: `test-data/{ui,api}/<area>.json` through the typed loader.
- Created entities: builders in `src/data/builders/` (they add `qa-<runId>-`), registered with
  the `cleanup` fixture. Never hard-code an entity name; never touch an unprefixed entity.
- Tests are independent: no shared state, no order. Company-wide settings → `@serial`.

## What ESLint blocks in specs

`page.locator` / `getBy*` / `$`, `request.*` and the raw `request` fixture, `waitForTimeout`,
Hebrew string literals, `test.skip` / `test.fixme` / `test.fail` / `test.only`, and importing
`test` from `@playwright/test`. Each one means a page object, client or fixture is missing.

## When the framework is missing something

Do not work around it. In the dev loop, return a framework request
(`{ need, why }`): the framework-architect builds it and you continue. Outside the loop, add it
with the `adding-a-page-object` or `adding-an-api-client` skill first.

## Before you finish

`npx playwright test --list`, `npx tsc --noEmit` and `npx eslint tests/` pass. A new or changed
case later runs `newCaseRepeat` times (3) with retries 0: a test that passes only sometimes is
a bug, not a pass.
