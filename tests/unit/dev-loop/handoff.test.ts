import { describe, expect, it } from 'vitest'
import {
  activateStatus,
  areaCoverage,
  commitSubject,
  deferredCriteria,
  newCaseIds,
  nextPlanNumber,
  ownerOfPath,
  pathInDetail,
  quarantineChanges,
  routeGateFailures,
  testPlanProblems
} from '../../../tools/dev-loop/handoff'
import { parseExecutionPlan } from '../../../tools/gates/parsers/execution-plan'
import { parseTestPlan } from '../../../tools/gates/parsers/test-plan'
import type { GateResult } from '../../../tools/gates/types'
import { repoFile, sampleRequest } from './fixtures'

const EXECUTION = parseExecutionPlan(repoFile('.test/auth/execution-plan.md'))

// An auth plan after the test planner took in the sample request: AC 1 covered, AC 2
// deferred, AC 3 a requirement no case covers, AC 4 missing.
function plannedAuth(): ReturnType<typeof parseTestPlan> {
  const markdown = [
    '# auth — Test plan',
    '',
    'Status: draft',
    '',
    '## Requirements',
    '',
    '| ID | Requirement | Source | Status |',
    '|---|---|---|---|',
    '| AUTH-AC-01 | Old criterion | .plan/001 step 10 | covered |',
    '| AUTH-AC-06 | An expired session shows the re-auth dialog | #local AC 1 | covered |',
    '| AUTH-AC-07 | Confirming completes the action | #local AC 2 | deferred: needs a second passkey prompt |',
    '| AUTH-AC-08 | Closing leaves the operator logged out | #local AC 3 | covered |',
    '',
    '## Test Cases',
    '',
    '| ID | Title | Covers | Layer | Type | Priority | Preconditions | Steps | Expected | Automation |',
    '|---|---|---|---|---|---|---|---|---|---|',
    '| AUTH-UI-001 | Old case | AUTH-AC-01 | ui | positive | P1 | None | 1. Open | Shown | planned |',
    '| AUTH-UI-004 | Expired session asks again | AUTH-AC-06 | ui | positive | P1 | An expired session | 1. Open users | The dialog is shown | planned |'
  ].join('\n')
  return parseTestPlan(markdown, 'auth', '.test/auth/test-plan.md')
}

describe('stage 2 hand-off: the test plan covers the request', () => {
  it('names each criterion that has no requirement, and each covered requirement with no case', () => {
    expect(testPlanProblems(sampleRequest(), plannedAuth(), EXECUTION)).toEqual([
      'AUTH-AC-08 (#local AC 3) is "covered" but no case covers it',
      'request criterion 4 ("The session endpoint answers 401 after the session has expired.") has no requirement row with Source "#local AC 4"'
    ])
  })

  it('matches the Source of an issue request exactly (AC 1 is not AC 10)', () => {
    const plan = plannedAuth()
    for (const requirement of plan.requirements)
      requirement.source = requirement.source.replace('#local AC 1', '#12 AC 10')

    expect(testPlanProblems(sampleRequest(12), plan, EXECUTION)[0]).toMatch(
      /^request criterion 1 .* Source "#12 AC 1"$/
    )
  })

  it('reports a broken execution plan and one for another area', () => {
    const request = sampleRequest()
    const plan = plannedAuth()

    expect(
      testPlanProblems(request, plan, new Error('execution-plan.md: missing YAML front matter'))
    ).toContain('execution-plan.md: missing YAML front matter')
    expect(
      testPlanProblems(request, plan, { ...EXECUTION, area: 'user', grep: '@user' })
    ).toContain('the execution plan is for area "user", the request for "auth"')
  })

  it('lists the deferred criteria for Gate A', () => {
    expect(deferredCriteria(sampleRequest(), plannedAuth())).toEqual([
      'AUTH-AC-07 (AC 2): deferred, needs a second passkey prompt'
    ])
  })
})

describe('plan and status helpers', () => {
  it('numbers the next plan after the highest one', () => {
    expect(
      nextPlanNumber(['000-backlog.md', '001-2026-10-16-agentic-qa-foundation.md', 'notes.txt'])
    ).toBe('002')
    expect(
      nextPlanNumber([
        '.plan/000-backlog.md',
        '.plan/009-2026-11-01-x.md',
        '.plan/003-2026-10-20-y.md'
      ])
    ).toBe('010')
  })

  it('flips the first Status line to active and nothing else', () => {
    expect(
      activateStatus('# Plan\n\nStatus: draft\nLast updated: today\n\nStatus: draft in prose')
    ).toBe('# Plan\n\nStatus: active\nLast updated: today\n\nStatus: draft in prose')
  })

  it('finds the cases a plan added since main', () => {
    const after = plannedAuth()
    const before = {
      ...after,
      cases: after.cases.filter(plannedCase => plannedCase.id === 'AUTH-UI-001')
    }

    expect(newCaseIds(before, after)).toEqual(['AUTH-UI-004'])
    expect(newCaseIds(undefined, after)).toEqual(['AUTH-UI-001', 'AUTH-UI-004'])
  })

  it('counts coverage over automated cases only', () => {
    expect(areaCoverage(plannedAuth(), new Set(['AUTH-UI-004']))).toEqual({
      requirements: 4,
      covered: 1,
      deferred: 1,
      cases: 2,
      automated: 1
    })
  })
})

describe('routing a failure to the agent that owns it', () => {
  it.each([
    ['tests/ui/auth/re-auth.spec.ts', 'test-developer-ui'],
    ['tests/e2e/auth/flow.spec.ts', 'test-developer-ui'],
    ['test-data/api/auth.json', 'test-developer-api'],
    ['tests/api/auth/session.spec.ts', 'test-developer-api'],
    ['src/ui/components/re-auth-dialog.ts', 'framework-architect'],
    ['tests/fixtures.ts', 'framework-architect'],
    ['.test/auth/test-plan.md', 'test-planner'],
    ['tools/gates/run-gate.ts', undefined],
    ['.test/quarantine.md', undefined]
  ])('%s → %s', (file, role) => {
    expect(ownerOfPath(file)).toBe(role)
  })

  it.each([
    [
      'tsc',
      'tests/ui/auth/re-auth.spec.ts(12,5): error TS2345: Argument of type',
      'tests/ui/auth/re-auth.spec.ts'
    ],
    [
      'ESLint',
      'src/ui/pages/home-page.ts:8:3 playwright/no-wait-for-timeout: Unexpected use',
      'src/ui/pages/home-page.ts'
    ],
    [
      'traceability',
      'tests/api/auth/session.spec.ts:9 "AUTH-API-009": case ID AUTH-API-009 is not in any',
      'tests/api/auth/session.spec.ts'
    ],
    ['a Windows path', 'tests\\ui\\auth\\x.spec.ts:1:1 error', 'tests/ui/auth/x.spec.ts'],
    ['a sentence end', 'see .test/auth/test-plan.md.', '.test/auth/test-plan.md']
  ])('reads the file from a %s detail', (_name, detail, file) => {
    expect(pathInDetail(detail)).toBe(file)
  })

  it('routes gate failures by file, and the rest to the owner', () => {
    const gate: GateResult = {
      ok: false,
      startedAt: '',
      durationMs: 0,
      base: 'main',
      allowAssertionChange: false,
      checks: [
        {
          id: 'typecheck',
          title: 'TypeScript',
          status: 'failed',
          summary: 'exit code 2',
          details: ['tests/ui/auth/a.spec.ts(3,1): error TS1']
        },
        {
          id: 'eslint',
          title: 'ESLint',
          status: 'failed',
          summary: '1 finding',
          details: ['src/api/clients/user-client.ts:4:1 x: y']
        },
        {
          id: 'vitest',
          title: 'Vitest',
          status: 'failed',
          summary: 'the check itself crashed',
          details: []
        },
        { id: 'prettier', title: 'Prettier', status: 'passed', summary: 'formatted', details: [] }
      ]
    }
    const routed = routeGateFailures(gate)

    expect(Object.fromEntries(routed.byRole)).toEqual({
      'test-developer-ui': ['gate typecheck: tests/ui/auth/a.spec.ts(3,1): error TS1'],
      'framework-architect': ['gate eslint: src/api/clients/user-client.ts:4:1 x: y']
    })
    expect(routed.owner).toEqual(['gate vitest: the check itself crashed'])
  })
})

describe('delivery helpers', () => {
  it.each([
    [
      'Session expiry and the re-auth dialog',
      'test(auth): cover session expiry and the re-auth dialog'
    ],
    ['auth: session expiry.', 'test(auth): cover session expiry'],
    ['API session checks', 'test(auth): cover API session checks']
  ])('makes a commitlint-ready subject from "%s"', (title, subject) => {
    expect(commitSubject('auth', title)).toBe(subject)
  })

  it('keeps the commit header within 100 characters, on a word boundary', () => {
    const header = commitSubject(
      'employee-report',
      'the operator reviews approves and locks a report or returns it for editing with a comment'
    )

    expect(header.length).toBeLessThanOrEqual(100)
    expect(header).toMatch(/^test\(employee-report\): cover the operator .*\w$/)
  })

  it('reads quarantine rows added and removed from a diff', () => {
    const diff = [
      '--- a/.test/quarantine.md',
      '+++ b/.test/quarantine.md',
      ' | Case ID | Issue | Reason | Approved by | Date |',
      '+| AUTH-UI-003 | #41 | logout keeps the session | owner | 2026-10-16 |',
      '-| AUTH-API-002 | #30 | fixed | owner | 2026-10-01 |'
    ].join('\n')

    expect(quarantineChanges(diff)).toEqual([
      'added: | AUTH-UI-003 | #41 | logout keeps the session | owner | 2026-10-16 |',
      'removed: | AUTH-API-002 | #30 | fixed | owner | 2026-10-01 |'
    ])
  })
})
