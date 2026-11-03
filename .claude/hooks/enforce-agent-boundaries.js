#!/usr/bin/env node
// PreToolUse guardrail: per-role write paths for the agents tools/dev-loop spawns.
// The driver sets AGENT_ROLE for every agent it runs, the orchestrator included. This hook
// blocks any Edit/Write/NotebookEdit outside that role's lane, and any Bash command that
// writes to an owner-only path. The lanes live in ./lib/role-write-paths.js, which the
// driver also uses to check each stage's changed files.
//
// No AGENT_ROLE (the owner's own session) → not this hook's job.
// An AGENT_ROLE the lane map does not know → blocked: fail closed, never open.
//
// Wired up in .claude/settings.json. A script in .claude/hooks/ that is not listed there
// never runs.

import path from 'node:path'
import { checkWrite, NO_ROLE_WRITES, KNOWN_ROLES, toRepoRelative } from './lib/role-write-paths.js'

const PATH_FIELDS = ['file_path', 'notebook_path']

// Shell operations that create, change or delete files. `2>&1` and `>&2` are only stream
// redirects, so they are stripped before this test.
const SHELL_WRITE =
  /(>{1,2})|\b(tee|sed\s+-i|perl\s+-pi|cp|mv|rm|rmdir|touch|mkdir|ln|truncate|dd|install|git\s+(checkout|restore|rm|mv|apply)|set-content|add-content|out-file|new-item|remove-item|copy-item|move-item)\b/i

let input = ''
process.stdin.on('data', chunk => {
  input += chunk
})
process.stdin.on('end', () => {
  const role = process.env.AGENT_ROLE
  if (!role) {
    process.exit(0)
  }

  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const toolInput = payload?.tool_input ?? {}
  const projectRoot = payload?.cwd || process.cwd()

  if (!KNOWN_ROLES.includes(role)) {
    block(`unknown AGENT_ROLE "${role}". Known roles: ${KNOWN_ROLES.join(', ')}`)
  }

  if (typeof toolInput.command === 'string') {
    checkShellCommand(role, toolInput.command)
    process.exit(0)
  }

  const rawPath = PATH_FIELDS.map(field => toolInput[field]).find(
    value => typeof value === 'string' && value
  )
  if (!rawPath) {
    process.exit(0)
  }

  const relPath = toRepoRelative(rawPath, projectRoot, path)
  const verdict = checkWrite(role, relPath)
  if (!verdict.allowed) {
    block(`"${role}" agent may not write here: ${verdict.reason}`)
  }

  process.exit(0)
})

function checkShellCommand(role, command) {
  const writes = SHELL_WRITE.test(command.replace(/\d*>&\d+/g, ''))
  if (!writes) return

  const protectedPath = NO_ROLE_WRITES.find(entry => mentionsPath(command, entry))
  if (protectedPath) {
    block(
      `"${role}" agent ran a shell command that writes near the owner-only path "${protectedPath}": ${command}`
    )
  }
}

function mentionsPath(command, entry) {
  const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\//g, '[\\\\/]')
  const pattern = new RegExp(`(^|[\\s"'=(]|\\.[\\\\/])${escaped}`, 'i')
  return pattern.test(command)
}

function block(message) {
  console.error(`[guardrail] ${message}`)
  process.exit(2) // exit code 2 = block the tool call
}
