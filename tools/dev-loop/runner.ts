import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { runDir } from '../../src/config/paths'
import { writeJson } from '../../src/utils/file-utils'
import { caseOutcomes, type CaseOutcome } from '../gates/coverage-report'
import { NODE_BIN, REPO_ROOT } from '../gates/exec'
import type { ExecutionPlan } from '../gates/parsers/execution-plan'
import type { PlannedCase } from '../gates/parsers/test-plan'
import { CASE_PROJECTS, readRunReports, type ReportedTest } from '../gates/test-inventory'
import { classifyFailures, type Failure } from './classify'

// Stage 7, the Test Runner: driver code, not an agent. Retries are always 0. Setup runs once
// as its own step; every profile then runs with --no-deps, so --repeat-each never repeats the
// login. @serial cases run in their own --workers=1 invocation.

export type Profile = 'setup' | 'smoke' | 'area' | 'regression'

export interface RunStep {
  step: string
  args: string[]
}

const PROJECTS = CASE_PROJECTS.map(project => `--project=${project}`)
const both = (first: string, second: string) => `(?=.*${first})(?=.*${second})`

export function profileSteps(
  profile: Profile,
  input: { plan?: ExecutionPlan; newSpecFiles?: string[] } = {}
): RunStep[] {
  const base = ['test', ...PROJECTS, '--no-deps']
  switch (profile) {
    case 'setup':
      return [{ step: 'setup', args: ['test', '--project=setup'] }]
    case 'smoke':
      return [
        { step: 'smoke', args: [...base, '--grep', '@smoke', '--grep-invert', '@serial'] },
        {
          step: 'smoke-serial',
          args: [
            ...base,
            '--grep',
            both('@smoke', '@serial'),
            '--workers=1',
            '--pass-with-no-tests'
          ]
        }
      ]
    case 'area': {
      const plan = input.plan
      if (!plan) throw new Error('the area profile needs the area execution plan')
      const steps: RunStep[] = plan.serial
        ? [{ step: 'area', args: [...base, '--grep', plan.grep, '--workers=1'] }]
        : [
            { step: 'area', args: [...base, '--grep', plan.grep, '--grep-invert', '@serial'] },
            {
              step: 'area-serial',
              args: [
                ...base,
                '--grep',
                both(plan.grep, '@serial'),
                '--workers=1',
                '--pass-with-no-tests'
              ]
            }
          ]
      if (input.newSpecFiles?.length) {
        steps.push({
          step: 'repeat',
          args: [
            ...base,
            '--repeat-each',
            String(plan.newCaseRepeat),
            '--workers=1',
            ...input.newSpecFiles.map(file => file.replace(/^tests\//, ''))
          ]
        })
      }
      return steps
    }
    case 'regression':
      return [
        { step: 'regression', args: [...base, '--grep-invert', '@quarantine|@serial'] },
        {
          step: 'regression-serial',
          args: [
            ...base,
            '--grep',
            '@serial',
            '--grep-invert',
            '@quarantine',
            '--workers=1',
            '--pass-with-no-tests'
          ]
        }
      ]
  }
}

export function commandLine(step: RunStep): string {
  return `npx playwright ${step.args.map(arg => (/[\s|()?*]/.test(arg) ? `"${arg}"` : arg)).join(' ')}`
}

// Runs one step with live output. Returns Playwright's exit code (1 = some test failed).
export function runStep(step: RunStep, runId: string): number {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, NODE_BIN.playwright), ...step.args],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, RUN_ID: runId, RUN_STEP: step.step },
      stdio: 'inherit'
    }
  )
  return result.status ?? 1
}

// The dev environment answers with TClock itself, not an error or a Cloudflare challenge.
export async function healthCheck(baseUrl: string): Promise<{ healthy: boolean; detail: string }> {
  try {
    const response = await fetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(20_000) })
    const body = await response.text()
    if (!response.ok) return { healthy: false, detail: `GET /login returned ${response.status}` }
    if (
      /Just a moment|challenge-platform|cf-chl/i.test(body) &&
      !/<title>TClock<\/title>/i.test(body)
    ) {
      return { healthy: false, detail: 'Cloudflare answered with a challenge page' }
    }
    if (!/<title>TClock<\/title>/i.test(body))
      return { healthy: false, detail: 'GET /login did not return the TClock app' }
    return { healthy: true, detail: 'GET /login returned the TClock app' }
  } catch (error) {
    return {
      healthy: false,
      detail: `GET /login failed: ${error instanceof Error ? error.message : String(error)}`
    }
  }
}

export interface RunSummary {
  runId: string
  steps: { step: string; tests: number; results: number }[]
  outcomes: Record<string, CaseOutcome>
}

// summary.json and failures.json for a run folder, from every step's results.json.
export async function summarizeRun(
  runId: string,
  healthy: boolean
): Promise<{ summary: RunSummary; failures: Failure[]; tests: ReportedTest[] }> {
  const directory = runDir(runId)
  const reports = await readRunReports(directory)
  const tests = reports
    .flatMap(report => report.tests)
    .filter(test => (CASE_PROJECTS as readonly string[]).includes(test.project))
  const summary: RunSummary = {
    runId,
    steps: reports.map(report => ({
      step: report.step,
      tests: report.tests.length,
      results: report.tests.reduce((sum, test) => sum + test.results.length, 0)
    })),
    outcomes: Object.fromEntries(caseOutcomes(tests))
  }
  const failures = classifyFailures({ tests, healthy })
  await writeJson(path.join(directory, 'summary.json'), summary)
  await writeJson(path.join(directory, 'failures.json'), failures)
  return { summary, failures, tests }
}

// .orchestrate/runs/<run-id>/allure-report from the run's allure-results. It stays local:
// a report can show company data, so it is never uploaded from here.
export function buildAllureReport(
  runId: string,
  options: { open?: boolean } = {}
): { code: number; reportDir: string } {
  const directory = runDir(runId)
  const reportDir = path.join(directory, 'allure-report')
  const args = [
    path.join(REPO_ROOT, NODE_BIN.allure),
    'generate',
    path.join(directory, 'allure-results'),
    '--output',
    reportDir,
    '--clean',
    '--report-name',
    `TClock QA ${runId}`,
    ...(options.open ? ['--open'] : [])
  ]
  const result = spawnSync(process.execPath, args, { cwd: REPO_ROOT, stdio: 'inherit' })
  return { code: result.status ?? 1, reportDir }
}

export interface ExitVerdict {
  met: boolean
  details: string[]
}

// The area's exit criteria, over the cases that are not quarantined.
export function evaluateExitCriteria(
  plan: ExecutionPlan,
  cases: PlannedCase[],
  outcomes: Record<string, CaseOutcome>,
  failures: Failure[],
  quarantined: Set<string>
): ExitVerdict {
  const counted = cases.filter(
    plannedCase => plannedCase.automation === 'planned' && !quarantined.has(plannedCase.id)
  )
  const rate = (subset: PlannedCase[]) =>
    subset.length
      ? (100 * subset.filter(plannedCase => outcomes[plannedCase.id] === 'passed').length) /
        subset.length
      : 100
  const p1 = rate(counted.filter(plannedCase => plannedCase.priority === 'P1'))
  const overall = rate(counted)
  const flaky = counted.filter(plannedCase => outcomes[plannedCase.id] === 'flaky').length
  const untriaged = failures.filter(
    failure => failure.class === 'untriaged' && !quarantined.has(failure.caseId)
  ).length

  const details = [
    `P1 pass rate ${p1.toFixed(0)}% (needs ${plan.exit.p1PassRate}%)`,
    `overall pass rate ${overall.toFixed(0)}% (needs ${plan.exit.overallPassRate}%)`,
    `new flaky ${flaky} (max ${plan.exit.maxNewFlaky})`,
    `untriaged failures ${untriaged} (max ${plan.exit.untriagedFailures})`,
    `quarantined and not counted: ${[...quarantined].join(', ') || 'none'}`
  ]
  const met =
    p1 >= plan.exit.p1PassRate &&
    overall >= plan.exit.overallPassRate &&
    flaky <= plan.exit.maxNewFlaky &&
    untriaged <= plan.exit.untriagedFailures
  return { met, details }
}
