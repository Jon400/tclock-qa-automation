#!/usr/bin/env node
// PreToolUse guardrail: the only TClock host any session may touch is the dev environment.
// Blocks a Bash command, a WebFetch, or a Playwright MCP call that names any other
// tclock.co.il host: production, www, or the bare apex domain.
//
// The framework enforces the same allowlist in src/config/settings.ts (BASE_URL), and the
// Playwright MCP servers in .mcp.json run with --allowed-origins. This hook covers the
// paths those two cannot see: curl, scripts, WebFetch.

const ALLOWED_HOSTS = ['dev.tclock.co.il']
const TCLOCK_HOST = /\b((?:[a-z0-9-]+\.)*tclock\.co\.il)\b/gi
const TARGET_FIELDS = ['command', 'url']

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

  const toolInput = payload?.tool_input ?? {}
  const text = TARGET_FIELDS.map(field => toolInput[field])
    .filter(value => typeof value === 'string')
    .join('\n')

  const hosts = [...text.matchAll(TCLOCK_HOST)].map(match => match[1].toLowerCase())
  const blocked = hosts.find(host => !ALLOWED_HOSTS.includes(host))

  if (blocked) {
    console.error(
      `[guardrail] Blocked ${payload?.tool_name ?? 'tool'} call to "${blocked}". ` +
        `The only allowed TClock host is ${ALLOWED_HOSTS.join(', ')}.`
    )
    process.exit(2)
  }

  process.exit(0)
})
