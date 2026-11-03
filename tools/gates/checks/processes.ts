import { existsSync } from 'node:fs'
import path from 'node:path'
import { git, REPO_ROOT, runNodeBin, type ExecResult } from '../exec'
import { failed, passed, type CheckResult } from '../types'

function tail(output: string, lines = 40): string[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .slice(-lines)
}

function fromExit(id: string, title: string, result: ExecResult, okSummary: string): CheckResult {
  return result.code === 0
    ? passed(id, title, okSummary)
    : failed(id, title, `exit code ${result.code}`, tail(`${result.stdout}\n${result.stderr}`))
}

export function checkTypecheck(cwd: string = REPO_ROOT): CheckResult {
  return fromExit(
    'typecheck',
    'TypeScript (tsc --noEmit)',
    runNodeBin('tsc', ['--noEmit'], { cwd }),
    'no type errors'
  )
}

export function checkPrettier(cwd: string = REPO_ROOT): CheckResult {
  return fromExit(
    'prettier',
    'Prettier',
    runNodeBin('prettier', ['--check', '.', '--log-level=warn'], { cwd }),
    'formatted'
  )
}

export function checkVitest(cwd: string = REPO_ROOT): CheckResult {
  const result = runNodeBin('vitest', ['run', '--reporter=dot'], { cwd })
  const summary = /Tests\s+(.+)/.exec(result.stdout)?.[1]?.trim() ?? 'unit tests passed'
  return fromExit('vitest', 'Unit tests (Vitest)', result, summary)
}

// The tracked and untracked-but-not-ignored files: what a commit could contain.
export function committableFiles(cwd: string = REPO_ROOT): string[] {
  return git(['ls-files', '--cached', '--others', '--exclude-standard'], cwd)
    .stdout.split(/\r?\n/)
    .map(line => line.trim())
    .filter(file => file && existsSync(path.join(cwd, file)))
}

export function checkSecretlint(
  cwd: string = REPO_ROOT,
  files: string[] = committableFiles(cwd)
): CheckResult {
  const id = 'secretlint'
  const title = 'Secrets (secretlint)'
  const scanned = files.filter(file => file !== 'package-lock.json')
  const findings: string[] = []
  // Keep each command line well under the Windows limit.
  for (let start = 0; start < scanned.length; start += 150) {
    const result = runNodeBin(
      'secretlint',
      ['--format', 'unix', ...scanned.slice(start, start + 150)],
      { cwd }
    )
    if (result.code !== 0) findings.push(...tail(`${result.stdout}\n${result.stderr}`, 60))
  }
  return findings.length
    ? failed(id, title, `${findings.length} finding(s)`, findings)
    : passed(id, title, `${scanned.length} files clean`)
}

// Text about to leave the machine (a bug issue, a PR body), scanned through stdin: files in
// .orchestrate/ are ignored by .gitignore and .secretlintignore, so a path would be skipped.
export function scanTextForSecrets(
  text: string,
  fileName: string,
  cwd: string = REPO_ROOT
): string[] {
  const result = runNodeBin('secretlint', ['--format', 'unix', '--stdinFileName', fileName], {
    cwd,
    input: text
  })
  return result.code === 0 ? [] : tail(`${result.stdout}\n${result.stderr}`, 20)
}
