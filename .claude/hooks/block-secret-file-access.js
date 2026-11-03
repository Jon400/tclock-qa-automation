#!/usr/bin/env node
// PreToolUse guardrail: hard-blocks any tool access to secret files, whichever tool is used
// to reach them (Read, Edit, Write, Bash, Grep, Glob...). permissions.deny only covers the
// exact tool + pattern listed and can't see inside a Bash command string; this hook inspects
// the target of every call, so `cat .env`, `Read(.auth/operator.json)` and
// `grep -r cookie .auth` are all caught the same way.
//
// Secret files in this repository:
// - `.env`: phone numbers of the QA users and any local overrides.
// - `.auth/`: Playwright storage state (session cookies) and exported passkeys.
// - `passkey*.json` anywhere: an exported passkey is a full login credential.
// `.env.example` is deliberately NOT matched: it is committed template content.
//
// Runs even under bypassPermissions: hooks are a separate enforcement layer from the
// permission system.

const SECRET_FILE_PATTERNS = [
  /(^|[/\\])\.env(\.local|\.development|\.production)?(?![\w.-])/i,
  /(^|[/\\])\.auth([/\\]|$)/i,
  /(^|[/\\])passkey[\w.-]*\.json$/i
]

const SECRET_IN_COMMAND_PATTERNS = [
  /(^|[\s"'=/\\])[\w./\\-]*\.env(\.local|\.development|\.production)?(?![\w.-])/i,
  /(^|[\s"'=/\\(])\.auth([/\\]|(?![\w.-]))/i,
  /passkey[\w.-]*\.json/i
]

// Only fields that NAME a target are inspected. A Write's `content` can legitimately mention
// a secret file (setup docs, .gitignore, this hook's own source) without touching one, and
// Grep's `pattern` is a regex, not a path.
const PATH_FIELDS_BY_TOOL = {
  Glob: ['path', 'pattern'],
  Grep: ['path', 'glob']
}
const DEFAULT_PATH_FIELDS = ['file_path', 'path', 'notebook_path']

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

  const toolName = payload?.tool_name ?? 'tool'
  const toolInput = payload?.tool_input ?? {}
  const fields = PATH_FIELDS_BY_TOOL[toolName] ?? DEFAULT_PATH_FIELDS

  const blockedPath = fields
    .map(field => toolInput[field])
    .find(
      value =>
        typeof value === 'string' && SECRET_FILE_PATTERNS.some(pattern => pattern.test(value))
    )

  // A shell command can reach a secret file without naming a path field:
  // `cat .env`, `type .auth\operator.json`, `node -e "...passkey.operator.json"`.
  const command = typeof toolInput.command === 'string' ? toolInput.command : ''
  const blockedCommand = SECRET_IN_COMMAND_PATTERNS.some(pattern => pattern.test(command))

  if (blockedPath || blockedCommand) {
    console.error(
      `[guardrail] Blocked ${toolName} call touching a secret file` +
        `${blockedPath ? `: ${blockedPath}` : ''}. Secrets live in .env and .auth/ and never reach an agent.` +
        ' Use .env.example for the variable list.'
    )
    process.exit(2)
  }

  process.exit(0)
})
