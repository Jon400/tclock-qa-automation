// Per-role write paths for the agents tools/dev-loop spawns. Single source of truth for:
// - .claude/hooks/enforce-agent-boundaries.js, which blocks the write before it happens, and
// - tools/dev-loop, which checks every agent stage's changed files after it ends (this also
//   catches writes made through Bash, which no PreToolUse hook can fully parse).
//
// Entry syntax: a string ending in "/" is a directory prefix, any other string is one exact
// file, and a RegExp is tested against the repo-relative path. Matching is case-insensitive
// because Windows file systems are.

export const ROLE_WRITE_PATHS = {
  orchestrator: ['.plan/', '.orchestrate/request-draft.md', '.orchestrate/task-graph.json'],
  'test-planner': ['.doc/sut/', /^\.test\/[^/]+\//i, '.orchestrate/explore/'],
  'framework-architect': [
    'src/',
    'tests/fixtures.ts',
    'tests/setup/',
    'tests/unit/',
    'playwright.config.ts',
    'vitest.config.ts',
    'tsconfig.json',
    'package.json',
    'package-lock.json',
    '.env.example',
    '.orchestrate/framework-architect-report.md'
  ],
  'test-developer-ui': [
    'tests/ui/',
    'tests/e2e/',
    'test-data/ui/',
    /^\.orchestrate\/test-developer-ui-[^/]+\.md$/i
  ],
  'test-developer-api': [
    'tests/api/',
    'test-data/api/',
    /^\.orchestrate\/test-developer-api-[^/]+\.md$/i
  ],
  'code-reviewer': ['.orchestrate/review-report.md'],
  'failure-analyzer': ['.orchestrate/triage/', '.orchestrate/bugs/']
}

// Owner-only paths. These win over every lane above: the gate and the driver that judge the
// agents' work, the rules they work under, the quarantine registry, and the unit tests that
// prove the gate, the driver and the hooks still work.
export const NO_ROLE_WRITES = [
  'tools/',
  'tests/unit/gates/',
  'tests/unit/dev-loop/',
  'tests/unit/hooks/',
  'tests/unit/fixtures/',
  'eslint.config.js',
  'commitlint.config.js',
  'lint-staged.config.js',
  '.prettierrc.json',
  '.prettierignore',
  '.secretlintrc.json',
  '.secretlintignore',
  '.gitignore',
  '.gitattributes',
  '.husky/',
  '.test/README.md',
  '.test/quarantine.md',
  '.test/master-test-plan.md',
  '.test/execution-plan.md',
  '.claude/',
  '.github/',
  '.cursor/',
  '.mcp.json',
  'AGENTS.md',
  'CLAUDE.md'
]

export const KNOWN_ROLES = Object.keys(ROLE_WRITE_PATHS)

export function toRepoRelative(rawPath, projectRoot, pathApi) {
  const relative = pathApi.isAbsolute(rawPath) ? pathApi.relative(projectRoot, rawPath) : rawPath
  return relative.replace(/\\/g, '/').replace(/^(\.\/)+/, '')
}

export function matchesEntry(entry, relPath) {
  if (entry instanceof RegExp) return entry.test(relPath)
  const candidate = relPath.toLowerCase()
  const target = entry.toLowerCase()
  return target.endsWith('/') ? candidate.startsWith(target) : candidate === target
}

export function isOwnerOnly(relPath) {
  return NO_ROLE_WRITES.some(entry => matchesEntry(entry, relPath))
}

// Returns { allowed, reason } for a repo-relative path. `relPath` must already be relative to
// the repository root (see toRepoRelative).
export function checkWrite(role, relPath) {
  const lane = ROLE_WRITE_PATHS[role]
  if (!lane) {
    return { allowed: false, reason: `unknown AGENT_ROLE "${role}"` }
  }
  if (
    !relPath ||
    relPath.startsWith('../') ||
    /^[a-z]:\//i.test(relPath) ||
    relPath.startsWith('/')
  ) {
    return { allowed: false, reason: `"${relPath}" is outside the repository` }
  }
  if (isOwnerOnly(relPath)) {
    return { allowed: false, reason: `"${relPath}" is owner-only (no agent role may write it)` }
  }
  if (lane.some(entry => matchesEntry(entry, relPath))) {
    return { allowed: true, reason: '' }
  }
  return {
    allowed: false,
    reason: `"${relPath}" is outside the ${role} lane (${lane.map(String).join(', ')})`
  }
}
