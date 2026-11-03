import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
  durationMs: number
}

// Package entry points, run with this Node binary: no shell, no npx, the same on Windows.
export const NODE_BIN = {
  tsc: 'node_modules/typescript/bin/tsc',
  prettier: 'node_modules/prettier/bin/prettier.cjs',
  vitest: 'node_modules/vitest/vitest.mjs',
  playwright: 'node_modules/@playwright/test/cli.js',
  secretlint: 'node_modules/secretlint/bin/secretlint.js',
  tsx: 'node_modules/tsx/dist/cli.mjs',
  allure: 'node_modules/allure/cli.js'
} as const

export function runNodeBin(
  bin: keyof typeof NODE_BIN,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {}
): ExecResult {
  const cwd = options.cwd ?? REPO_ROOT
  return run(process.execPath, [path.join(cwd, NODE_BIN[bin]), ...args], {
    cwd,
    ...(options.env ? { env: options.env } : {}),
    ...(options.input === undefined ? {} : { input: options.input })
  })
}

export function run(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: string } = {}
): ExecResult {
  const started = Date.now()
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...(options.input === undefined ? {} : { input: options.input })
  })
  return {
    code: result.status ?? (result.error ? 127 : 1),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? (result.error ? result.error.message : ''),
    durationMs: Date.now() - started
  }
}

export function git(args: string[], cwd: string = REPO_ROOT): ExecResult {
  return run('git', args, { cwd })
}
