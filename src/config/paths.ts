import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Role } from './enum'

export const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

// Secrets: gitignored, and blocked from every agent by .claude/hooks/block-secret-file-access.js.
export const AUTH_DIR = path.join(REPO_ROOT, '.auth')
export const RUNS_DIR = path.join(REPO_ROOT, '.orchestrate', 'runs')
export const TEST_DATA_DIR = path.join(REPO_ROOT, 'test-data')

// Playwright storage state (session cookies + localStorage) for one role, refreshed every run.
export function storageStatePath(role: Role): string {
  return path.join(AUTH_DIR, `${role}.json`)
}

// The exported WebAuthn credential for one role: a full login credential, never committed.
export function passkeyPath(role: Role): string {
  return path.join(AUTH_DIR, `passkey.${role}.json`)
}

// One run of the dev loop: .orchestrate/runs/<run-id>/. Each Playwright invocation in it
// (setup, smoke, area, ...) writes its own step folder; Allure results are shared.
export function runDir(runId: string): string {
  return path.join(RUNS_DIR, runId)
}

export function runStepDir(runId: string, step: string): string {
  return path.join(runDir(runId), step)
}
