import { describe, expect, it } from 'vitest'
import { classifyFailures, countByClass } from '../../../tools/dev-loop/classify'
import type { ReportedTest } from '../../../tools/gates/test-inventory'

// One test of a run, with one result per attempt (an error makes the attempt fail).
function reportedTest(
  caseId: string,
  attempts: (string | null)[],
  file = 'tests/ui/auth/logout.spec.ts'
): ReportedTest {
  return {
    file,
    line: 12,
    title: `${caseId} title`,
    project: 'ui',
    caseIds: [caseId],
    tags: ['@auth'],
    results: attempts.map(error => ({
      status: error === null ? 'passed' : 'failed',
      durationMs: 1200,
      errors: error === null ? [] : [error],
      failingStep: error === null ? undefined : 'Log out',
      tracePath: error === null ? undefined : '.orchestrate/runs/261016-101500-ab12/area/trace.zip'
    }))
  }
}

const ASSERTION = 'Error: expect(received).toBe(expected)\n\nExpected: 401\nReceived: 200'

describe('failure classifier', () => {
  it('ignores a case that passed every attempt', () => {
    expect(
      classifyFailures({ tests: [reportedTest('AUTH-UI-001', [null, null])], healthy: true })
    ).toEqual([])
  })

  it.each([
    [
      'a refused connection',
      'page.goto: net::ERR_CONNECTION_REFUSED at https://dev.tclock.co.il/home'
    ],
    ['a 502 from the dev host', 'Error: expected status 200, actual 502'],
    ['a Cloudflare challenge page', 'Expected heading, got page titled "Just a moment..."'],
    ['a socket error', 'apiRequestContext.get: socket hang up']
  ])('labels %s as env', (_name, error) => {
    const [failure] = classifyFailures({
      tests: [reportedTest('AUTH-UI-003', [error])],
      healthy: true
    })

    expect(failure?.class).toBe('env')
  })

  it('labels every failure env when the health check after the run failed', () => {
    const [failure] = classifyFailures({
      tests: [reportedTest('AUTH-UI-003', [ASSERTION])],
      healthy: false
    })

    expect(failure).toMatchObject({
      class: 'env',
      reason: 'the dev health check failed after the run'
    })
  })

  it('labels a case that passed and failed across repeats flaky', () => {
    const tests = [
      reportedTest('AUTH-UI-003', [null, ASSERTION]),
      reportedTest('AUTH-UI-003', [null])
    ]
    const [failure] = classifyFailures({ tests, healthy: true })

    expect(failure).toMatchObject({ class: 'flaky', passed: 2, failed: 1 })
  })

  it('leaves everything else untriaged, with what triage needs', () => {
    const [failure] = classifyFailures({
      tests: [reportedTest('AUTH-UI-003', [ASSERTION, ASSERTION])],
      healthy: true
    })

    expect(failure).toMatchObject({
      caseId: 'AUTH-UI-003',
      class: 'untriaged',
      step: 'Log out',
      errors: [ASSERTION],
      file: 'tests/ui/auth/logout.spec.ts',
      tracePath: '.orchestrate/runs/261016-101500-ab12/area/trace.zip',
      passed: 0,
      failed: 2
    })
  })

  it('counts failures by class', () => {
    const failures = classifyFailures({
      tests: [
        reportedTest('AUTH-UI-001', ['net::ERR_CONNECTION_RESET']),
        reportedTest('AUTH-UI-002', [null, ASSERTION]),
        reportedTest('AUTH-UI-003', [ASSERTION])
      ],
      healthy: true
    })

    expect(countByClass(failures)).toEqual({
      env: 1,
      flaky: 1,
      untriaged: 1,
      'test-bug': 0,
      'product-bug': 0
    })
  })
})
