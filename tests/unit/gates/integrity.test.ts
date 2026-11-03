import { mkdtempSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checkIntegrity } from '../../../tools/gates/checks/integrity'
import { git } from '../../../tools/gates/exec'

// Each test builds a throwaway git repository with a spec on `main`, then changes it on a
// feature branch, exactly as an agent would in the loop.
let repo: string

const SPEC = 'tests/ui/demo/thing.spec.ts'
const ORIGINAL = [
  "import { expect, test } from '../../fixtures'",
  "test('thing', async ({ page }) => {",
  '  await expect(page).toHaveURL(/home/)',
  "  expect(await page.title()).toBe('Home')",
  '})',
  ''
].join('\n')

const write = (file: string, content: string) => {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
  writeFileSync(path.join(repo, file), content)
}
const mustGit = (...args: string[]) => {
  const result = git(args, repo)
  if (result.code !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'gate-integrity-'))
  mustGit('init', '--quiet', '--initial-branch=main')
  mustGit('config', 'user.email', 'gate@example.com')
  mustGit('config', 'user.name', 'gate')
  mustGit('config', 'core.autocrlf', 'false')
  write(SPEC, ORIGINAL)
  mustGit('add', '.')
  mustGit('commit', '--quiet', '-m', 'test: baseline')
  mustGit('switch', '--quiet', '-c', 'test/demo')
})

afterEach(() => {
  rmSync(repo, { recursive: true, force: true })
})

const run = (allowAssertionChange = false) =>
  checkIntegrity({ cwd: repo, base: 'main', allowAssertionChange })

describe('assertion integrity (rule 1)', () => {
  it('passes when assertions are untouched and new ones are added', () => {
    write(SPEC, ORIGINAL.replace('})\n', '  await expect(page).toHaveTitle(/x/)\n})\n'))
    write('tests/api/demo/new.spec.ts', 'expect(1).toBe(2)\n')

    expect(run()).toMatchObject({
      status: 'passed',
      summary: '1 spec(s) on main keep their assertions'
    })
  })

  it('fails on an edited expect( in a spec that exists on main, committed or not', () => {
    write(SPEC, ORIGINAL.replace("toBe('Home')", "toBe('Login')"))

    const result = run()

    expect(result.status).toBe('failed')
    expect(result.details).toEqual([
      `${SPEC}: changed or removed assertion: expect(await page.title()).toBe('Home')`
    ])
  })

  it('fails on a removed assertion and on a deleted spec', () => {
    write(SPEC, ORIGINAL.replace('  await expect(page).toHaveURL(/home/)\n', ''))
    expect(run().details).toEqual([
      `${SPEC}: changed or removed assertion: await expect(page).toHaveURL(/home/)`
    ])

    unlinkSync(path.join(repo, SPEC))
    expect(run().details).toEqual([
      `${SPEC}: deleted, but it exists on main (its assertions would disappear)`
    ])
  })

  it('ignores whitespace-only reformatting', () => {
    write(
      SPEC,
      ORIGINAL.replace(
        '  await expect(page).toHaveURL(/home/)',
        '    await expect(page).toHaveURL(/home/)'
      )
    )

    expect(run().status).toBe('passed')
  })

  it('lets only the owner allow the change, and still lists it', () => {
    write(SPEC, ORIGINAL.replace("toBe('Home')", "toBe('Login')"))

    expect(run(true)).toMatchObject({
      status: 'passed',
      details: [expect.stringContaining("toBe('Home')")]
    })
  })

  it('is skipped when there is no main to compare with', () => {
    expect(checkIntegrity({ cwd: repo, base: 'release', allowAssertionChange: false }).status).toBe(
      'skipped'
    )
  })
})
