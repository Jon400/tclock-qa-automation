import type { ReportedTest } from '../../../tools/gates/test-inventory'

// A small, valid area for the gate's tests: two requirements, three cases, three tests.
// Each negative test changes one thing and expects exactly that check to fail.

export const REQUIREMENTS = [
  '| DEMO-AC-01 | A user can do the thing | #1 | covered |',
  '| DEMO-AC-02 | A visitor cannot do the thing | #1 | covered |'
]

export const CASES = [
  '| DEMO-UI-001 | Does the thing | DEMO-AC-01 | ui | positive | P1 | Logged in | 1. Open<br>2. Click | Done | planned |',
  '| DEMO-API-001 | Rejects a visitor | DEMO-AC-02 | api | negative | P1 | None | 1. Call without cookies | 401 | planned |',
  '| DEMO-UI-002 | Shows a hint on empty input | risk | ui | edge | P3 | Logged in | 1. Submit empty | A hint | planned |'
]

export function planMarkdown(
  requirements: string[] = REQUIREMENTS,
  cases: string[] = CASES
): string {
  return [
    '# demo — Test plan',
    '',
    'Status: active',
    '',
    '## Requirements',
    '',
    '| ID | Requirement | Source | Status |',
    '|---|---|---|---|',
    ...requirements,
    '',
    '## Test Cases',
    '',
    '| ID | Title | Covers | Layer | Type | Priority | Preconditions | Steps | Expected | Automation |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...cases,
    ''
  ].join('\n')
}

export function reportedTest(caseId: string, overrides: Partial<ReportedTest> = {}): ReportedTest {
  const layer = caseId.includes('-API-') ? 'api' : 'ui'
  return {
    file: `tests/${layer}/demo/demo.spec.ts`,
    line: 10,
    title: `test for ${caseId}`,
    project: layer,
    caseIds: [caseId],
    tags: ['@demo'],
    results: [],
    ...overrides
  }
}

export const TESTS: ReportedTest[] = [
  reportedTest('DEMO-UI-001'),
  reportedTest('DEMO-API-001'),
  reportedTest('DEMO-UI-002')
]
