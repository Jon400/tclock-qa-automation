import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCoverageReport, caseOutcomes } from '../../../tools/gates/coverage-report'
import { parseTestPlan } from '../../../tools/gates/parsers/test-plan'
import { latestRun, type RunResult } from '../../../tools/gates/test-inventory'
import { planMarkdown, reportedTest, TESTS } from './plan-fixture'

const result = (status: string): RunResult => ({
  status,
  durationMs: 1,
  errors: [],
  failingStep: undefined,
  tracePath: undefined
})

describe('case outcomes', () => {
  it('derives passed, failed and flaky across repeats', () => {
    const outcomes = caseOutcomes([
      reportedTest('DEMO-UI-001', { results: [result('passed'), result('passed')] }),
      reportedTest('DEMO-API-001', { results: [result('failed'), result('timedOut')] }),
      reportedTest('DEMO-UI-002', {
        results: [result('passed'), result('failed'), result('passed')]
      })
    ])

    expect(Object.fromEntries(outcomes)).toEqual({
      'DEMO-UI-001': 'passed',
      'DEMO-API-001': 'failed',
      'DEMO-UI-002': 'flaky'
    })
  })
})

describe('coverage report', () => {
  const plan = parseTestPlan(planMarkdown(), 'demo', '.test/demo/test-plan.md')

  it('shows requirement → cases → tests → last result, and planned vs automated', () => {
    const report = buildCoverageReport({
      plans: [plan],
      tests: TESTS.slice(0, 2),
      outcomes: new Map([
        ['DEMO-UI-001', 'passed'],
        ['DEMO-API-001', 'failed']
      ]),
      runId: '261016-090507-a1b2',
      generatedAt: new Date('2026-10-16T10:00:00Z')
    })

    expect(report).toContain('Last run: 261016-090507-a1b2')
    expect(report).toContain('| demo | 2 | 2 | 0 | 3 | 3 | 2 | 1 | 1 | 0 | 1 |')
    expect(report).toContain(
      '| DEMO-AC-01 | A user can do the thing | covered | DEMO-UI-001 | passed |'
    )
    expect(report).toContain(
      '| DEMO-AC-02 | A visitor cannot do the thing | covered | DEMO-API-001 | failed |'
    )
    expect(report).toContain(
      '| DEMO-UI-002 | Shows a hint on empty input | ui | P3 | planned | no | — | not run |'
    )
  })
})

describe('the run the coverage report reads', () => {
  // A results.json with one test of the given project, as Playwright's JSON reporter writes it.
  const results = (projectName: string, caseId?: string) =>
    JSON.stringify({
      suites: [
        {
          title: 'a.spec.ts',
          specs: [
            {
              title: 'a test',
              file: 'a.spec.ts',
              line: 1,
              tests: [
                {
                  projectName,
                  annotations: caseId ? [{ type: 'case', description: caseId }] : [],
                  results: [{ status: 'passed' }]
                }
              ]
            }
          ]
        }
      ]
    })

  it('is the newest run that ran a planned case, not a newer setup-only run', async () => {
    const runs = await mkdtemp(path.join(tmpdir(), 'runs-'))
    try {
      await mkdir(path.join(runs, '261016-100000-aaaa', 'area'), { recursive: true })
      await writeFile(
        path.join(runs, '261016-100000-aaaa', 'area', 'results.json'),
        results('ui', 'DEMO-UI-001')
      )
      await mkdir(path.join(runs, '261016-110000-bbbb', 'setup'), { recursive: true })
      await writeFile(
        path.join(runs, '261016-110000-bbbb', 'setup', 'results.json'),
        results('setup')
      )
      await mkdir(path.join(runs, '261016-120000-cccc', 'run'), { recursive: true })

      const run = await latestRun(runs)

      expect(path.basename(run?.dir ?? '')).toBe('261016-100000-aaaa')
    } finally {
      await rm(runs, { recursive: true, force: true })
    }
  })
})
