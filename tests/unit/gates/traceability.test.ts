import { describe, expect, it } from 'vitest'
import { checkTraceability } from '../../../tools/gates/checks/traceability'
import type { QuarantineEntry } from '../../../tools/gates/parsers/quarantine'
import { parseTestPlan } from '../../../tools/gates/parsers/test-plan'
import { CASES, planMarkdown, reportedTest, REQUIREMENTS, TESTS } from './plan-fixture'

const plan = (requirements = REQUIREMENTS, cases = CASES) =>
  parseTestPlan(planMarkdown(requirements, cases), 'demo', '.test/demo/test-plan.md')

const quarantineEntry: QuarantineEntry = {
  caseId: 'DEMO-UI-002',
  issue: '#5',
  reason: 'product bug',
  approvedBy: 'Jon400',
  date: '2026-10-16',
  line: 5
}

describe('traceability and AC coverage', () => {
  it('passes a fully traced area', () => {
    const result = checkTraceability({ plans: [plan()], tests: TESTS, quarantine: [] })

    expect(result.status).toBe('passed')
    expect(result.summary).toBe('3 tests → 3 cases → 2 requirements')
  })

  it('ignores the setup project, which logs in and is not a case', () => {
    const setup = reportedTest('DEMO-UI-001', { project: 'setup', caseIds: [] })

    expect(
      checkTraceability({ plans: [plan()], tests: [...TESTS, setup], quarantine: [] }).status
    ).toBe('passed')
  })

  // The negative fixtures from the plan's Validation section: each makes the check fail.
  it.each([
    [
      '@quarantine with no registry entry',
      () => ({
        tests: [
          ...TESTS.slice(0, 2),
          reportedTest('DEMO-UI-002', { tags: ['@demo', '@quarantine'] })
        ]
      }),
      'has no entry in .test/quarantine.md'
    ],
    [
      'a case ID that is not in the test plan',
      () => ({ tests: [...TESTS, reportedTest('DEMO-UI-099')] }),
      'DEMO-UI-099 is not in any .test/<area>/test-plan.md'
    ],
    [
      'a planned case with no test',
      () => ({ tests: TESTS.slice(0, 2) }),
      'DEMO-UI-002 is planned but no test'
    ],
    [
      'a requirement that no case covers and that is not deferred',
      () => ({
        plans: [plan([...REQUIREMENTS, '| DEMO-AC-03 | Something else | #1 | covered |'])]
      }),
      'DEMO-AC-03 is not covered by any case and not deferred'
    ],
    [
      'a case whose Covers names an unknown requirement ID',
      () => ({
        plans: [
          plan(REQUIREMENTS, [
            CASES[0]?.replace('| DEMO-AC-01 |', '| DEMO-AC-01, DEMO-AC-09 |') ?? '',
            ...CASES.slice(1)
          ])
        ]
      }),
      'covers unknown requirement DEMO-AC-09'
    ],
    [
      'a duplicate case ID in a test plan',
      () => ({ plans: [plan(REQUIREMENTS, [...CASES, CASES[0] ?? ''])] }),
      'duplicate case ID DEMO-UI-001'
    ],
    [
      'a test with no case annotation',
      () => ({ tests: [...TESTS, reportedTest('DEMO-UI-001', { caseIds: [] })] }),
      'needs exactly one case annotation, has 0'
    ],
    [
      'a test with two case annotations',
      () => ({
        tests: [
          ...TESTS.slice(1),
          reportedTest('DEMO-UI-001', { caseIds: ['DEMO-UI-001', 'DEMO-UI-002'] })
        ]
      }),
      'needs exactly one case annotation, has 2'
    ],
    [
      'a test in the wrong layer folder',
      () => ({
        tests: [
          ...TESTS.slice(1),
          reportedTest('DEMO-UI-001', { file: 'tests/api/demo/x.spec.ts' })
        ]
      }),
      'is a ui case but the test lives in tests/api/'
    ],
    [
      'a test without its area tag',
      () => ({ tests: [...TESTS.slice(1), reportedTest('DEMO-UI-001', { tags: ['@smoke'] })] }),
      'missing the area tag @demo'
    ],
    [
      'a manual case that has a test',
      () => ({
        plans: [
          plan(REQUIREMENTS, [
            CASES[0]?.replace('| planned |', '| manual |') ?? '',
            ...CASES.slice(1)
          ])
        ]
      }),
      'DEMO-UI-001 is marked manual but has a test'
    ]
  ])('fails on %s', (_name, change, message) => {
    const input = { plans: [plan()], tests: TESTS, quarantine: [], ...change() }

    const result = checkTraceability(input)

    expect(result.status).toBe('failed')
    expect(result.details).toContainEqual(expect.stringContaining(message))
  })

  it('accepts @quarantine for a registered case, and flags a stale registry entry', () => {
    const quarantinedTests = [
      ...TESTS.slice(0, 2),
      reportedTest('DEMO-UI-002', { tags: ['@demo', '@quarantine'] })
    ]

    expect(
      checkTraceability({ plans: [plan()], tests: quarantinedTests, quarantine: [quarantineEntry] })
        .status
    ).toBe('passed')

    const stale = checkTraceability({
      plans: [plan()],
      tests: TESTS,
      quarantine: [{ ...quarantineEntry, caseId: 'DEMO-UI-077' }]
    })
    expect(stale.details).toContainEqual(
      expect.stringContaining('DEMO-UI-077 is not a planned case')
    )
  })

  it('accepts a deferred requirement with no case', () => {
    const deferred = plan([
      ...REQUIREMENTS,
      '| DEMO-AC-03 | Later | #1 | deferred: out of the sandbox |'
    ])

    expect(checkTraceability({ plans: [deferred], tests: TESTS, quarantine: [] }).status).toBe(
      'passed'
    )
  })
})
