import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { checkWrite } from '../../.claude/hooks/lib/role-write-paths.js'
import { git, REPO_ROOT } from '../gates/exec'

// The second half of the write-path guard. The hook blocks a write before it happens; this
// compares the working tree before and after an agent stage and fails the stage on any
// change outside the role's lane, whichever tool made it (Bash included).

export type TreeSnapshot = Map<string, string>

// Every changed or untracked file (not ignored), with a hash of its content.
export function snapshotTree(cwd: string = REPO_ROOT): TreeSnapshot {
  const status = git(['status', '--porcelain=v1', '-uall', '-z'], cwd).stdout
  const snapshot: TreeSnapshot = new Map()
  const entries = status.split('\0').filter(Boolean)
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? ''
    const code = entry.slice(0, 2)
    const file = entry.slice(3)
    // A rename is followed by its source path.
    if (code.startsWith('R')) index++
    snapshot.set(file, hashOf(cwd, file))
  }
  return snapshot
}

function hashOf(cwd: string, file: string): string {
  try {
    return createHash('sha1')
      .update(readFileSync(path.join(cwd, file)))
      .digest('hex')
  } catch {
    return 'deleted'
  }
}

export function changedSince(before: TreeSnapshot, after: TreeSnapshot): string[] {
  const changed = new Set<string>()
  for (const [file, hash] of after) if (before.get(file) !== hash) changed.add(file)
  for (const file of before.keys()) if (!after.has(file)) changed.add(file)
  return [...changed].sort()
}

export function laneViolations(role: string, changed: string[]): string[] {
  return changed
    .map(file => ({ file, verdict: checkWrite(role, file) }))
    .filter(({ verdict }) => !verdict.allowed)
    .map(({ file, verdict }) => `${file}: ${verdict.reason}`)
}
