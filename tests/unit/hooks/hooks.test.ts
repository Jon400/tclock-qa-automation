import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { git, REPO_ROOT } from '../../../tools/gates/exec'

// Each hook runs exactly as Claude Code runs it: a node process, the tool call as JSON on
// stdin, the verdict as the exit code (2 = block).
function runHook(hook: string, payload: Record<string, unknown>, role?: string): number | null {
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, '.claude', 'hooks', hook)], {
    input: JSON.stringify({ cwd: REPO_ROOT, ...payload }),
    env: { ...process.env, AGENT_ROLE: role ?? '' },
    encoding: 'utf8'
  })
  return result.status
}

const write = (file: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: file, content: 'x' }
})
const bash = (command: string) => ({ tool_name: 'Bash', tool_input: { command } })
const read = (file: string) => ({ tool_name: 'Read', tool_input: { file_path: file } })

describe('enforce-agent-boundaries.js', () => {
  const hook = 'enforce-agent-boundaries.js'

  it.each([
    ['test-developer-ui', 'src/ui/pages/x-page.ts'],
    ['test-developer-ui', 'tests/api/auth/x.spec.ts'],
    ['framework-architect', 'tests/ui/auth/x.spec.ts'],
    ['test-developer-api', 'tests/ui/auth/x.spec.ts'],
    ['code-reviewer', 'tests/ui/auth/x.spec.ts'],
    ['orchestrator', 'src/config/settings.ts']
  ])('blocks %s writing %s', (role, file) => {
    expect(runHook(hook, write(file), role)).toBe(2)
  })

  it.each([
    'orchestrator',
    'test-planner',
    'framework-architect',
    'test-developer-ui',
    'test-developer-api',
    'code-reviewer',
    'failure-analyzer'
  ])('blocks %s writing owner-only paths', role => {
    for (const file of [
      '.test/quarantine.md',
      '.github/pull_request_template.md',
      'tools/gates/index.ts',
      'eslint.config.js',
      '.claude/settings.json'
    ]) {
      expect(runHook(hook, write(file), role), `${role} → ${file}`).toBe(2)
    }
  })

  it.each([
    ['test-developer-ui', 'tests/ui/auth/x.spec.ts'],
    ['test-developer-ui', 'tests/e2e/auth/x.spec.ts'],
    ['test-developer-ui', '.orchestrate/test-developer-ui-report.md'],
    ['test-developer-api', 'tests/api/auth/x.spec.ts'],
    ['framework-architect', 'src/ui/pages/x-page.ts'],
    ['framework-architect', 'tests/unit/config/x.test.ts'],
    ['test-planner', '.test/auth/test-plan.md'],
    ['test-planner', '.doc/sut/auth.md'],
    ['orchestrator', '.orchestrate/task-graph.json'],
    ['code-reviewer', '.orchestrate/review-report.md']
  ])('allows %s writing %s', (role, file) => {
    expect(runHook(hook, write(file), role)).toBe(0)
  })

  it('blocks the framework architect from the gate, driver and hook tests', () => {
    for (const file of [
      'tests/unit/gates/x.test.ts',
      'tests/unit/dev-loop/x.test.ts',
      'tests/unit/hooks/x.test.ts'
    ]) {
      expect(runHook(hook, write(file), 'framework-architect')).toBe(2)
    }
  })

  it('blocks the test planner from the owner files at the top of .test/', () => {
    expect(runHook(hook, write('.test/master-test-plan.md'), 'test-planner')).toBe(2)
    expect(runHook(hook, write('.test/execution-plan.md'), 'test-planner')).toBe(2)
  })

  it('resolves absolute paths against the project root and blocks paths outside it', () => {
    expect(
      runHook(
        hook,
        write(path.join(REPO_ROOT, 'tests', 'api', 'auth', 'x.spec.ts')),
        'test-developer-api'
      )
    ).toBe(0)
    expect(
      runHook(hook, write(path.join(REPO_ROOT, '..', 'elsewhere.ts')), 'test-developer-api')
    ).toBe(2)
  })

  it('fails closed on an unknown role and leaves the owner alone', () => {
    expect(runHook(hook, write('tests/ui/x.spec.ts'), 'hacker')).toBe(2)
    expect(runHook(hook, write('tools/gates/index.ts'))).toBe(0)
  })

  it('blocks a shell command that writes an owner-only path, and allows reading it', () => {
    expect(runHook(hook, bash('echo x > tools/gates/index.ts'), 'test-developer-api')).toBe(2)
    expect(runHook(hook, bash('sed -i s/0/1/ eslint.config.js'), 'framework-architect')).toBe(2)
    expect(runHook(hook, bash('cat tools/gates/index.ts 2>&1'), 'test-developer-api')).toBe(0)
    expect(runHook(hook, bash('npx playwright test --list'), 'test-developer-api')).toBe(0)
  })
})

describe('block-destructive-bash.js', () => {
  const hook = 'block-destructive-bash.js'

  it.each([
    'gh pr merge 1',
    'gh repo delete Jon400/x --yes',
    'gh release create v1.0.0',
    'git push --force',
    'rm -rf node_modules'
  ])('blocks "%s" for everyone', command => {
    expect(runHook(hook, bash(command))).toBe(2)
  })

  it('lets the owner read GitHub, and blocks every gh command for an agent role', () => {
    expect(runHook(hook, bash('gh issue list'))).toBe(0)
    expect(runHook(hook, bash('gh issue list'), 'test-planner')).toBe(2)
    expect(runHook(hook, bash('npm run lint && gh pr view 3'), 'code-reviewer')).toBe(2)
  })

  it('blocks git writes for agents and allows git reads', () => {
    expect(runHook(hook, bash('git commit -m "test: x"'), 'test-developer-ui')).toBe(2)
    expect(
      runHook(hook, bash('git checkout main -- tests/ui/x.spec.ts'), 'test-developer-ui')
    ).toBe(2)
    expect(runHook(hook, bash('git diff main --stat'), 'code-reviewer')).toBe(0)
    expect(runHook(hook, bash('git log --oneline -5'), 'code-reviewer')).toBe(0)
  })
})

describe('block-secret-file-access.js', () => {
  const hook = 'block-secret-file-access.js'

  it.each([
    '.auth/operator.json',
    '.auth/passkey.employee.json',
    'C:\\repo\\.auth\\employee.json',
    '.env',
    'backup/passkey.operator.json'
  ])('blocks reading %s', file => {
    expect(runHook(hook, read(file))).toBe(2)
  })

  it('blocks shell access and a Grep into .auth/', () => {
    expect(runHook(hook, bash('cat .auth/operator.json'))).toBe(2)
    expect(runHook(hook, bash('type .env'))).toBe(2)
    expect(
      runHook(hook, { tool_name: 'Grep', tool_input: { pattern: 'cookie', glob: '.auth/*' } })
    ).toBe(2)
  })

  it('allows the framework code, the template and a search for the word', () => {
    expect(runHook(hook, read('src/auth/passkey-store.ts'))).toBe(0)
    expect(runHook(hook, read('.env.example'))).toBe(0)
    expect(
      runHook(hook, { tool_name: 'Grep', tool_input: { pattern: '\\.auth/', path: 'src' } })
    ).toBe(0)
    expect(runHook(hook, bash('node -e "console.log(process.env.HOME)"'))).toBe(0)
  })
})

describe('enforce-target-allowlist.js', () => {
  const hook = 'enforce-target-allowlist.js'

  it.each([
    'curl https://tclock.co.il/',
    'curl https://www.tclock.co.il/login',
    'wget app.tclock.co.il'
  ])('blocks "%s"', command => {
    expect(runHook(hook, bash(command))).toBe(2)
  })

  it('blocks a WebFetch or a browser navigation to another TClock host', () => {
    expect(
      runHook(hook, { tool_name: 'WebFetch', tool_input: { url: 'https://tclock.co.il/x' } })
    ).toBe(2)
    expect(
      runHook(hook, {
        tool_name: 'mcp__playwright-operator__browser_navigate',
        tool_input: { url: 'https://tclock.co.il' }
      })
    ).toBe(2)
  })

  it('allows the dev host and unrelated hosts', () => {
    expect(runHook(hook, bash('curl -sI https://dev.tclock.co.il/login'))).toBe(0)
    expect(
      runHook(hook, {
        tool_name: 'WebFetch',
        tool_input: { url: 'https://playwright.dev/docs/intro' }
      })
    ).toBe(0)
  })
})

describe('.gitignore', () => {
  it.each(['.auth/operator.json', '.auth/passkey.operator.json', '.env', '.orchestrate/gate.json'])(
    'ignores %s',
    file => {
      expect(git(['check-ignore', '--quiet', '--no-index', file]).code).toBe(0)
    }
  )

  it('keeps the templates tracked', () => {
    expect(git(['check-ignore', '--quiet', '--no-index', '.env.example']).code).toBe(1)
    expect(git(['check-ignore', '--quiet', '--no-index', '.orchestrate/README.md']).code).toBe(1)
  })
})
