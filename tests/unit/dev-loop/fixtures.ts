import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { GhRunner } from '../../../tools/dev-loop/github'
import { parseTestRequest, type TestRequest } from '../../../tools/dev-loop/intake'
import { REPO_ROOT, type ExecResult } from '../../../tools/gates/exec'

// Shared inputs for the dev-loop tests: the files under tests/unit/fixtures/ and a recorded
// stand-in for the GitHub CLI.

export function fixture(name: string): string {
  return readFileSync(path.join(REPO_ROOT, 'tests', 'unit', 'fixtures', name), 'utf8')
}

export function repoFile(name: string): string {
  return readFileSync(path.join(REPO_ROOT, name), 'utf8')
}

export function sampleRequest(issue: number | null = null): TestRequest {
  return parseTestRequest(fixture('test-request.md'), { issue, allowInferred: false })
}

export function ok(stdout: string): ExecResult {
  return { code: 0, stdout, stderr: '', durationMs: 1 }
}

// Answers each `gh <command> <subcommand>` with recorded output and records every call. A
// command without a recorded answer fails the test.
export function recordedGh(responses: Record<string, string | ExecResult>): {
  run: GhRunner
  calls: string[][]
} {
  const calls: string[][] = []
  const run: GhRunner = args => {
    calls.push(args)
    const key = args.slice(0, 2).join(' ')
    const response = responses[key]
    if (response === undefined) throw new Error(`unexpected call: gh ${args.join(' ')}`)
    return typeof response === 'string' ? ok(response) : response
  }
  return { run, calls }
}
