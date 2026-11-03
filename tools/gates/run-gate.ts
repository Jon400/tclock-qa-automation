import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { checkConfigGuard } from './checks/config-guard'
import { checkEslint } from './checks/eslint'
import { checkIntegrity } from './checks/integrity'
import { checkPrettier, checkSecretlint, checkTypecheck, checkVitest } from './checks/processes'
import { checkTraceability } from './checks/traceability'
import { buildCoverageReport, caseOutcomes } from './coverage-report'
import { loadQuarantine, loadTestPlans } from './load'
import { latestRun, listTests, type Inventory } from './test-inventory'
import { failed, passed, skipped, type CheckResult, type GateResult } from './types'

export const CHECK_IDS = [
  'config-guard',
  'typecheck',
  'eslint',
  'prettier',
  'playwright-list',
  'traceability',
  'vitest',
  'integrity',
  'secretlint'
] as const
export type CheckId = (typeof CHECK_IDS)[number]

// The subset tools/dev-loop runs after the framework-architect stage.
export const FRAMEWORK_SUBSET: CheckId[] = ['config-guard', 'typecheck', 'eslint', 'vitest']

export interface GateOptions {
  cwd: string
  checks: readonly CheckId[]
  base: string
  allowAssertionChange: boolean
  onCheck?: (result: CheckResult) => void
}

export interface GateOutput {
  result: GateResult
  coverageReport: string | undefined
}

export async function runGate(options: GateOptions): Promise<GateOutput> {
  const started = Date.now()
  const { cwd } = options
  const checks: CheckResult[] = []
  const wanted = new Set(options.checks)
  let inventory: Inventory | undefined

  const record = async (id: CheckId, run: () => CheckResult | Promise<CheckResult>) => {
    if (!wanted.has(id)) return
    const checkStarted = Date.now()
    let result: CheckResult
    try {
      result = await run()
    } catch (error) {
      result = failed(id, id, 'the check itself crashed', [
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      ])
    }
    result.durationMs = Date.now() - checkStarted
    checks.push(result)
    options.onCheck?.(result)
  }

  await record('config-guard', async () =>
    checkConfigGuard({
      playwrightConfig: await readFile(path.join(cwd, 'playwright.config.ts'), 'utf8'),
      tsconfig: await readFile(path.join(cwd, 'tsconfig.json'), 'utf8'),
      packageJson: await readFile(path.join(cwd, 'package.json'), 'utf8')
    })
  )
  await record('typecheck', () => checkTypecheck(cwd))
  await record('eslint', () => checkEslint(cwd))
  await record('prettier', () => checkPrettier(cwd))
  await record('playwright-list', () => {
    const listed = listTests(cwd)
    inventory = listed
    const problems = [...listed.errors]
    if (listed.exitCode !== 0 && !problems.length)
      problems.push(listed.stderr.trim() || `exit code ${listed.exitCode}`)
    return problems.length
      ? failed(
          'playwright-list',
          'Test collection (playwright test --list)',
          'collection errors',
          problems
        )
      : passed(
          'playwright-list',
          'Test collection (playwright test --list)',
          `${listed.tests.length} tests collected`
        )
  })
  await record('traceability', async () => {
    if (!inventory) {
      inventory = listTests(cwd)
    }
    if (inventory.errors.length) {
      return skipped('traceability', 'Traceability and AC coverage', 'test collection failed')
    }
    const quarantine = await loadQuarantine(cwd)
    return checkTraceability({
      plans: await loadTestPlans(cwd),
      tests: inventory.tests,
      quarantine: quarantine.entries,
      quarantineErrors: quarantine.errors
    })
  })
  await record('vitest', () => checkVitest(cwd))
  await record('integrity', () =>
    checkIntegrity({ cwd, base: options.base, allowAssertionChange: options.allowAssertionChange })
  )
  await record('secretlint', () => checkSecretlint(cwd))

  let coverageReport: string | undefined
  if (inventory && !inventory.errors.length) {
    const run = await latestRun(path.join(cwd, '.orchestrate', 'runs'))
    const reports = run?.reports ?? []
    coverageReport = buildCoverageReport({
      plans: await loadTestPlans(cwd),
      tests: inventory.tests,
      outcomes: caseOutcomes(reports.flatMap(report => report.tests)),
      runId: run ? path.basename(run.dir) : undefined,
      generatedAt: new Date()
    })
  }

  return {
    result: {
      ok: checks.every(check => check.status !== 'failed'),
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      base: options.base,
      allowAssertionChange: options.allowAssertionChange,
      checks
    },
    coverageReport
  }
}
