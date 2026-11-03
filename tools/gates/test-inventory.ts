import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { runNodeBin } from './exec'

// Playwright's JSON report, for both `playwright test --list --reporter=json` (no results)
// and a run's results.json (with results). Only the fields this repository reads.

const AttachmentSchema = z.object({
  name: z.string(),
  path: z.string().optional(),
  contentType: z.string().optional()
})
const ErrorSchema = z.object({ message: z.string().optional(), stack: z.string().optional() })
interface JsonStep {
  title: string
  error?: z.infer<typeof ErrorSchema> | undefined
  steps?: JsonStep[] | undefined
}
const StepSchema: z.ZodType<JsonStep> = z.lazy(() =>
  z.object({
    title: z.string(),
    error: ErrorSchema.optional(),
    steps: z.array(StepSchema).optional()
  })
)
const ResultSchema = z.object({
  status: z.string(),
  duration: z.number().optional(),
  retry: z.number().optional(),
  errors: z.array(ErrorSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  steps: z.array(StepSchema).optional()
})
const TestSchema = z.object({
  projectName: z.string(),
  annotations: z
    .array(z.object({ type: z.string(), description: z.string().optional() }))
    .default([]),
  results: z.array(ResultSchema).default([])
})
const SpecSchema = z.object({
  title: z.string(),
  file: z.string(),
  line: z.number(),
  tags: z.array(z.string()).default([]),
  tests: z.array(TestSchema)
})
interface JsonSuite {
  title: string
  specs?: z.infer<typeof SpecSchema>[] | undefined
  suites?: JsonSuite[] | undefined
}
const SuiteSchema: z.ZodType<JsonSuite> = z.lazy(() =>
  z.object({
    title: z.string(),
    specs: z.array(SpecSchema).optional(),
    suites: z.array(SuiteSchema).optional()
  })
)
const ReportSchema = z.object({
  config: z.object({ rootDir: z.string().optional() }).optional(),
  suites: z.array(SuiteSchema),
  errors: z.array(ErrorSchema).default([])
})

export interface RunResult {
  status: string
  durationMs: number
  errors: string[]
  failingStep: string | undefined
  tracePath: string | undefined
}

export interface ReportedTest {
  file: string // repo-relative with forward slashes, e.g. tests/ui/auth/login.spec.ts
  line: number
  title: string
  project: string
  caseIds: string[]
  tags: string[] // with "@"
  results: RunResult[]
}

export interface Inventory {
  tests: ReportedTest[]
  errors: string[]
}

// The projects whose tests trace to planned cases. `setup` logs in; it is not a case.
export const CASE_PROJECTS = ['ui', 'api', 'e2e'] as const

export function parseReport(raw: unknown, testDir = 'tests'): Inventory {
  const report = ReportSchema.parse(raw)
  const tests: ReportedTest[] = []
  const visit = (suite: JsonSuite, titles: string[]) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        tests.push({
          file: path.posix.join(testDir, spec.file.replace(/\\/g, '/')),
          line: spec.line,
          title: [...titles, spec.title].join(' › '),
          project: test.projectName,
          caseIds: test.annotations
            .filter(annotation => annotation.type === 'case')
            .map(a => a.description ?? ''),
          tags: spec.tags.map(tag => (tag.startsWith('@') ? tag : `@${tag}`)),
          results: test.results.map(toRunResult)
        })
      }
    }
    for (const child of suite.suites ?? []) visit(child, [...titles, child.title])
  }
  // The top-level suites are files; their title is the file path, not a describe block.
  for (const fileSuite of report.suites) visit(fileSuite, [])
  return { tests, errors: report.errors.map(error => error.message ?? 'unknown error') }
}

function toRunResult(result: z.infer<typeof ResultSchema>): RunResult {
  return {
    status: result.status,
    durationMs: result.duration ?? 0,
    errors: (result.errors ?? []).map(error => stripAnsi(error.message ?? '')).filter(Boolean),
    failingStep: deepestFailingStep(result.steps ?? []),
    tracePath: result.attachments?.find(attachment => attachment.name === 'trace')?.path
  }
}

function deepestFailingStep(steps: JsonStep[]): string | undefined {
  for (const step of steps) {
    if (step.error) {
      return deepestFailingStep(step.steps ?? []) ?? step.title
    }
  }
  return undefined
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex -- ANSI colour codes from Playwright's error output
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

// `playwright test --list --reporter=json`: every test, with its annotations and tags,
// without running anything and without needing .env.
export function listTests(cwd?: string): Inventory & { exitCode: number; stderr: string } {
  const result = runNodeBin('playwright', ['test', '--list', '--reporter=json'], cwd ? { cwd } : {})
  if (!result.stdout.trim()) {
    return {
      tests: [],
      errors: [result.stderr.trim() || 'playwright --list printed nothing'],
      exitCode: result.code,
      stderr: result.stderr
    }
  }
  const inventory = parseReport(JSON.parse(result.stdout))
  return { ...inventory, exitCode: result.code, stderr: result.stderr }
}

// Every results.json under a run folder (one per step: setup, smoke, area, ...).
export async function readRunReports(
  runDirectory: string
): Promise<{ step: string; tests: ReportedTest[] }[]> {
  const steps = await readdir(runDirectory, { withFileTypes: true }).catch(() => [])
  const reports: { step: string; tests: ReportedTest[] }[] = []
  for (const entry of steps
    .filter(candidate => candidate.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(runDirectory, entry.name, 'results.json')
    const text = await readFile(file, 'utf8').catch(() => undefined)
    if (text) reports.push({ step: entry.name, tests: parseReport(JSON.parse(text)).tests })
  }
  return reports
}

// The newest run under .orchestrate/runs that ran a planned case (run ids sort by time). A
// setup-only run (a login, `npm run test:setup`) does not count: it says nothing about cases.
export async function latestRun(
  runsDirectory: string
): Promise<{ dir: string; reports: { step: string; tests: ReportedTest[] }[] } | undefined> {
  const entries = await readdir(runsDirectory, { withFileTypes: true }).catch(() => [])
  const runs = entries
    .filter(entry => entry.isDirectory() && /^\d{6}-\d{6}-[0-9a-f]{4}$/.test(entry.name))
    .map(entry => entry.name)
    .sort()
    .reverse()
  for (const name of runs) {
    const dir = path.join(runsDirectory, name)
    const reports = await readRunReports(dir)
    const ranACase = reports.some(report =>
      report.tests.some(
        test => (CASE_PROJECTS as readonly string[]).includes(test.project) && test.results.length
      )
    )
    if (ranACase) {
      return { dir, reports }
    }
  }
  return undefined
}
