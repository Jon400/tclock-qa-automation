import { describe, expect, it } from 'vitest'
import { lintText } from '../../../tools/gates/checks/eslint'

// The ESLint half of the gate, proven against the repository's real eslint.config.js.
// Every snippet is linted as if it lived at the given path; nothing is written to disk.
const SPEC = 'tests/ui/demo/gate-fixture.spec.ts'
const header = "import { expect, test, testCase } from '../../fixtures'\n\n"
const body = (code: string) =>
  `${header}test('fixture', testCase('DEMO-UI-001'), async ({ operatorPage }) => {\n${code}\n})\n`

describe('ESLint rules for specs', () => {
  it('passes a spec that uses the framework', async () => {
    expect(await lintText(body('  await expect(operatorPage).toHaveURL(/home/)'), SPEC)).toEqual([])
  })

  it.each([
    [
      'page.getByRole',
      body("  await expect(operatorPage.getByRole('button')).toBeVisible()"),
      'no-restricted-syntax'
    ],
    [
      'page.locator',
      body("  await expect(operatorPage.locator('#x')).toBeVisible()"),
      'no-restricted-syntax'
    ],
    [
      'a Hebrew string literal',
      body("  await expect(operatorPage).toHaveTitle('כניסה')"),
      'no-restricted-syntax'
    ],
    [
      'a Hebrew template literal',
      body('  await expect(operatorPage).toHaveTitle(`כניסה`)'),
      'no-restricted-syntax'
    ],
    [
      'waitForTimeout',
      body('  await operatorPage.waitForTimeout(500)\n  await expect(operatorPage).toHaveURL(/x/)'),
      'no-restricted-syntax'
    ],
    [
      'test.skip',
      `${header}test.skip('fixture', async ({ operatorPage }) => {\n  await expect(operatorPage).toHaveURL(/x/)\n})\n`,
      'playwright/no-skipped-test'
    ],
    [
      'test.only',
      `${header}test.only('fixture', async ({ operatorPage }) => {\n  await expect(operatorPage).toHaveURL(/x/)\n})\n`,
      'playwright/no-focused-test'
    ],
    [
      'test.fixme',
      `${header}test.fixme('fixture', async ({ operatorPage }) => {\n  await expect(operatorPage).toHaveURL(/x/)\n})\n`,
      'no-restricted-syntax'
    ],
    [
      'test.fail',
      `${header}test.fail('fixture', async ({ operatorPage }) => {\n  await expect(operatorPage).toHaveURL(/x/)\n})\n`,
      'no-restricted-syntax'
    ],
    [
      'the raw request fixture',
      `${header}test('fixture', async ({ request }) => {\n  expect((await request.get('/web/x')).status()).toBe(200)\n})\n`,
      'no-restricted-syntax'
    ],
    [
      'importing test from @playwright/test',
      "import { expect, test } from '@playwright/test'\ntest('fixture', async ({ page }) => {\n  await expect(page).toHaveURL(/x/)\n})\n",
      'no-restricted-imports'
    ]
  ])('fails a spec that uses %s', async (_name, code, rule) => {
    expect(await lintText(code, SPEC)).toContain(rule)
  })
})

describe('ESLint determinism rule (rule 5)', () => {
  it.each(['src/api/clients/demo-client.ts', 'tests/fixtures-demo.ts', 'tests/ui/demo/x.spec.ts'])(
    'fails an @anthropic-ai/sdk import in %s',
    async file => {
      const code =
        "import Anthropic from '@anthropic-ai/sdk'\nexport const client = new Anthropic()\n"

      expect(await lintText(code, file)).toContain('no-restricted-imports')
    }
  )

  it('fails a tools/ import in src/', async () => {
    const code =
      "import { runGate } from '../../tools/gates/run-gate'\nexport const gate = runGate\n"

    expect(await lintText(code, 'src/utils/demo.ts')).toContain('no-restricted-imports')
  })

  it('allows the Agent SDK in tools/', async () => {
    const code =
      "import { query } from '@anthropic-ai/claude-agent-sdk'\nexport const run = query\n"

    expect(await lintText(code, 'tools/dev-loop/demo.ts')).not.toContain('no-restricted-imports')
  })
})
