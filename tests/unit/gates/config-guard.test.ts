import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkConfigGuard } from '../../../tools/gates/checks/config-guard'
import { REPO_ROOT } from '../../../tools/gates/exec'

const read = (file: string) => readFileSync(path.join(REPO_ROOT, file), 'utf8')
const real = () => ({
  playwrightConfig: read('playwright.config.ts'),
  tsconfig: read('tsconfig.json'),
  packageJson: read('package.json')
})

describe('config guard', () => {
  it('passes the real configuration', () => {
    expect(checkConfigGuard(real())).toMatchObject({ status: 'passed', details: [] })
  })

  it('fails on retries: 1 in the Playwright config', () => {
    const input = {
      ...real(),
      playwrightConfig: real().playwrightConfig.replace('retries: 0', 'retries: 1')
    }

    expect(checkConfigGuard(input).details).toEqual([
      'playwright.config.ts: retries is "1"; it must be the literal 0'
    ])
  })

  it('fails on a conditional retry, a project-level retry, and a missing one', () => {
    const conditional = {
      ...real(),
      playwrightConfig: 'export default { retries: process.env.CI ? 2 : 0 }'
    }
    const project = {
      ...real(),
      playwrightConfig: "retries: 0,\nprojects: [{ name: 'ui', retries: 2 }]"
    }
    const missing = { ...real(), playwrightConfig: 'export default {}' }

    expect(checkConfigGuard(conditional).status).toBe('failed')
    expect(checkConfigGuard(project).details).toEqual([
      'playwright.config.ts: retries is "2"; it must be the literal 0'
    ])
    expect(checkConfigGuard(missing).details).toEqual([
      'playwright.config.ts: `retries: 0` must be set explicitly'
    ])
  })

  it('fails when TypeScript is not strict', () => {
    const tsconfig = JSON.stringify({
      compilerOptions: { strict: false, noUncheckedIndexedAccess: true }
    })

    expect(checkConfigGuard({ ...real(), tsconfig }).details).toEqual([
      'tsconfig.json: compilerOptions.strict must be true'
    ])
  })

  it('fails on a --retries flag in an npm script', () => {
    const packageJson = JSON.stringify({ scripts: { 'test:smoke': 'playwright test --retries=2' } })

    expect(checkConfigGuard({ ...real(), packageJson }).details).toEqual([
      'package.json scripts.test:smoke: passes --retries=2'
    ])
  })
})
