import { existsSync } from 'node:fs'
import path from 'node:path'
import { git as runGit, type ExecResult } from '../exec'
import { passed, skipped, verdict, type CheckResult } from '../types'

const ID = 'integrity'
const TITLE = 'Assertion integrity'
const SPEC_DIRS = ['tests/ui', 'tests/api', 'tests/e2e']

export interface IntegrityOptions {
  cwd: string
  base: string
  // Owner only. tools/dev-loop never passes it.
  allowAssertionChange: boolean
  git?: (args: string[], cwd: string) => ExecResult
}

// Rule 1: never change an assertion just to make a test pass. Fails when, against the merge
// base with `base`, a spec that already exists there loses or changes an `expect(` line, or
// is deleted. New specs and new assertions are always fine. Uncommitted changes count.
export function checkIntegrity(options: IntegrityOptions): CheckResult {
  const git = options.git ?? runGit
  const { cwd, base } = options

  if (git(['rev-parse', '--verify', '--quiet', 'HEAD'], cwd).code !== 0) {
    return skipped(ID, TITLE, 'no commits yet: nothing to compare against')
  }
  if (git(['rev-parse', '--verify', '--quiet', base], cwd).code !== 0) {
    return skipped(ID, TITLE, `no "${base}" branch: nothing to compare against`)
  }
  const mergeBase = git(['merge-base', 'HEAD', base], cwd)
  if (mergeBase.code !== 0) {
    return skipped(ID, TITLE, `HEAD and ${base} share no history`)
  }
  const baseSha = mergeBase.stdout.trim()

  const listed = git(['ls-tree', '-r', '--name-only', baseSha, '--', ...SPEC_DIRS], cwd)
  const baselineSpecs = listed.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(file => file.endsWith('.spec.ts'))

  const findings: string[] = []
  for (const file of baselineSpecs) {
    if (!existsSync(path.join(cwd, file))) {
      findings.push(`${file}: deleted, but it exists on ${base} (its assertions would disappear)`)
      continue
    }
    const diff = git(['diff', '-w', '--no-color', '--unified=0', baseSha, '--', file], cwd)
    for (const line of diff.stdout.split(/\r?\n/)) {
      if (line.startsWith('-') && !line.startsWith('---') && /\bexpect(\.soft)?\(/.test(line)) {
        findings.push(`${file}: changed or removed assertion: ${line.slice(1).trim()}`)
      }
    }
  }

  if (findings.length && options.allowAssertionChange) {
    return passed(
      ID,
      TITLE,
      `${findings.length} assertion change(s) allowed by the owner`,
      findings
    )
  }
  return verdict(
    ID,
    TITLE,
    findings,
    `${baselineSpecs.length} spec(s) on ${base} keep their assertions`
  )
}
