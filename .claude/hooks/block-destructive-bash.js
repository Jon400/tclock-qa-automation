#!/usr/bin/env node
// PreToolUse guardrail: blocks destructive shell commands before they run, even when the
// agent's prompt would have allowed them and even under bypassPermissions.
//
// Two lists:
// - DENY_FOR_EVERYONE applies to every session, the owner's included. Merges, releases and
//   deletions on GitHub stay manual, outside Claude Code.
// - DENY_FOR_AGENT_ROLES applies when AGENT_ROLE is set, which tools/dev-loop does for every
//   agent it spawns. Agents never call GitHub (only the driver and the owner run `gh`), and
//   never change git history or branches (the driver commits after Gate C).
//
// Access to secret FILES is handled by block-secret-file-access.js, which runs on every tool.
// Do not add a bare /\.env\b/ rule here: it also matches `process.env` and `$env:`.

const DENY_FOR_EVERYONE = [
  /\brm\s+-rf\b/i,
  /\bgit\s+push\s+(-f\b|--force)/i,
  /\bgit\s+reset\s+--hard/i,
  /\bgh\s+pr\s+merge\b/i,
  /\bgh\s+repo\s+delete\b/i,
  /\bgh\s+release\s+(create|delete)\b/i,
  /\bgh\s+issue\s+delete\b/i
]

const DENY_FOR_AGENT_ROLES = [
  /(^|[^\w.-])gh(\.exe)?(\s|$)/i,
  /\bgit\s+(commit|push|merge|rebase|tag|reset|revert|cherry-pick|stash|clean|checkout|switch|restore|worktree|am|apply)\b/i,
  /\bgit\s+branch\s+(-d|-D|-m|-M|--delete|--move)\b/
]

let input = ''
process.stdin.on('data', chunk => {
  input += chunk
})
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    process.exit(0)
  }

  const command = payload?.tool_input?.command ?? ''
  const role = process.env.AGENT_ROLE
  const patterns = role ? [...DENY_FOR_EVERYONE, ...DENY_FOR_AGENT_ROLES] : DENY_FOR_EVERYONE
  const match = patterns.find(pattern => pattern.test(command))

  if (match) {
    const who = role ? `"${role}" agent` : 'session'
    console.error(`[guardrail] Blocked ${who} command matching ${match}: ${command}`)
    process.exit(2) // exit code 2 = block the tool call
  }

  process.exit(0)
})
