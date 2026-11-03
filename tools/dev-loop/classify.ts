import type { ReportedTest } from '../gates/test-inventory'

// Stage 8: the driver's classification rules. Only what code can decide is decided here:
// an environment problem, or a flaky case. Everything else is untriaged and goes to the owner
// (phase 1) or the failure-analyzer agent (phase 2), who labels it a test bug or a product bug.

export type FailureClass = 'env' | 'flaky' | 'untriaged' | 'test-bug' | 'product-bug'

export interface Failure {
  caseId: string
  title: string
  file: string
  line: number
  project: string
  step: string | undefined
  errors: string[]
  tracePath: string | undefined
  passed: number
  failed: number
  class: FailureClass
  reason: string
}

// The dev server is down or restarting, Cloudflare answered instead of TClock, or the
// network failed. None of these say anything about TClock's behaviour.
export const ENV_ERROR_PATTERNS: readonly RegExp[] = [
  /net::ERR_[A-Z_]+/,
  /\bE(CONNREFUSED|CONNRESET|TIMEDOUT|AI_AGAIN|NOTFOUND|PIPE)\b/,
  /getaddrinfo/i,
  /socket hang up/i,
  /\b(502|503|504) (Bad Gateway|Service Unavailable|Gateway Timeout)\b/i,
  /actual (502|503|504)\b/,
  /error code: 50[234]/i,
  /Just a moment\.\.\.|cf-chl|challenge-platform|Attention Required! \| Cloudflare/i,
  /Target page, context or browser has been closed.*(crash|disconnected)/i
]

export interface ClassifyInput {
  tests: ReportedTest[]
  // The driver's health check after the run. A failed check makes every failure env.
  healthy: boolean
}

export function classifyFailures({ tests, healthy }: ClassifyInput): Failure[] {
  const byCase = new Map<string, ReportedTest[]>()
  for (const test of tests) {
    const caseId = test.caseIds[0] ?? `${test.file}:${test.line}`
    byCase.set(caseId, [...(byCase.get(caseId) ?? []), test])
  }

  const failures: Failure[] = []
  for (const [caseId, caseTests] of byCase) {
    const results = caseTests.flatMap(test =>
      test.results.filter(result => result.status !== 'skipped')
    )
    const failedResults = results.filter(result => result.status !== 'passed')
    if (!failedResults.length) continue

    const first = caseTests[0]
    const firstFailure = failedResults[0]
    if (!first || !firstFailure) continue
    const passed = results.length - failedResults.length
    const errors = [...new Set(failedResults.flatMap(result => result.errors))]

    let failureClass: FailureClass = 'untriaged'
    let reason = 'needs triage: test bug or product bug'
    if (!healthy) {
      failureClass = 'env'
      reason = 'the dev health check failed after the run'
    } else if (errors.some(error => ENV_ERROR_PATTERNS.some(pattern => pattern.test(error)))) {
      failureClass = 'env'
      reason = 'the error is a connection, 5xx or challenge-page error'
    } else if (passed > 0) {
      failureClass = 'flaky'
      reason = `passed ${passed} and failed ${failedResults.length} time(s) across repeats`
    }

    failures.push({
      caseId,
      title: first.title,
      file: first.file,
      line: first.line,
      project: first.project,
      step: firstFailure.failingStep,
      errors,
      tracePath: failedResults.find(result => result.tracePath)?.tracePath,
      passed,
      failed: failedResults.length,
      class: failureClass,
      reason
    })
  }
  return failures
}

export function countByClass(failures: Failure[]): Record<FailureClass, number> {
  const counts: Record<FailureClass, number> = {
    env: 0,
    flaky: 0,
    untriaged: 0,
    'test-bug': 0,
    'product-bug': 0
  }
  for (const failure of failures) counts[failure.class]++
  return counts
}
