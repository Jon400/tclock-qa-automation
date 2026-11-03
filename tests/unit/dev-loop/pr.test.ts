import { describe, expect, it } from 'vitest'
import { renderPrBody, type PrEvidence } from '../../../tools/dev-loop/pr'
import type { GateResult } from '../../../tools/gates/types'
import { repoFile } from './fixtures'

const TEMPLATE = repoFile('.github/pull_request_template.md')

const GATE: GateResult = {
  ok: true,
  startedAt: '2026-10-16T10:00:00.000Z',
  durationMs: 61_000,
  base: 'main',
  allowAssertionChange: false,
  checks: [
    {
      id: 'typecheck',
      title: 'TypeScript (tsc --noEmit)',
      status: 'passed',
      summary: 'no type errors',
      details: []
    },
    {
      id: 'traceability',
      title: 'Traceability and AC coverage',
      status: 'passed',
      summary: '9 cases traced',
      details: []
    }
  ]
}

function evidence(overrides: Partial<PrEvidence> = {}): PrEvidence {
  return {
    requestIssue: 12,
    requestTitle: 'Session expiry and the re-auth dialog',
    area: 'auth',
    summary: ['New cases: AUTH-UI-004, AUTH-API-003'],
    gate: GATE,
    runId: '261016-120000-cd34',
    outcomes: new Map([
      ['AUTH-UI-004', 'passed'],
      ['AUTH-API-003', 'passed'],
      ['AUTH-UI-003', 'failed']
    ]),
    allureReport: '`.orchestrate/runs/261016-120000-cd34/allure-report`',
    coverage: { requirements: 9, covered: 8, deferred: 1, cases: 9, automated: 9 },
    bugs: [
      {
        kind: 'created',
        caseId: 'AUTH-UI-003',
        number: 41,
        url: 'https://github.com/qa-owner/tclock-qa-automation/issues/41'
      }
    ],
    localBugDrafts: 1,
    findings: [
      {
        id: 'R1',
        severity: 'blocker',
        owner: 'test-developer-ui',
        file: 'tests/ui/auth/re-auth.spec.ts:20',
        message: 'waits on time, not on the response',
        resolution: 'fixed in repair round 1'
      }
    ],
    quarantineChanges: [
      'added: | AUTH-UI-003 | #41 | logout keeps the session | owner | 2026-10-16 |'
    ],
    ciChecks: undefined,
    approvedBy: 'qa-owner',
    approvedAt: '2026-10-16T12:30:00.000Z',
    ...overrides
  }
}

function section(body: string, heading: string): string {
  const match = new RegExp(`## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`).exec(body)
  if (!match?.[1]) throw new Error(`no "## ${heading}" section`)
  return match[1].trim()
}

describe('pull request body', () => {
  const body = renderPrBody(TEMPLATE, evidence())

  it('closes the request issue', () => {
    expect(section(body, 'Request')).toBe('Closes #12 — Session expiry and the re-auth dialog')
  })

  it('fills all five evidence sections of the guide', () => {
    expect(section(body, 'CI results')).toContain('Local run `261016-120000-cd34`')
    expect(section(body, 'CI results')).toContain(
      'Gate: **passed**. Regression: 2 passed, 1 failed, 0 flaky.'
    )
    expect(section(body, 'Allure evidence')).toContain('| AUTH-UI-003 | failed |')
    expect(section(body, 'Allure evidence')).toContain('allure-report')
    expect(section(body, 'Coverage report')).toBe(
      '8 of 9 requirements covered (1 deferred with owner approval); 9 of 9 cases automated.\n\n' +
        'Requirement → cases → tests → last result: `.orchestrate/coverage-report.md` (computed by the gate).'
    )
    expect(section(body, 'Bug issues')).toBe(
      '- `AUTH-UI-003`: #41 (filed)\n- 1 security-sensitive draft(s) kept local.'
    )
    expect(section(body, 'Human approval')).toBe(
      'Gate C approved by qa-owner at 2026-10-16T12:30:00.000Z. Merge stays manual.'
    )
  })

  it('lists the review findings and the quarantine changes', () => {
    expect(section(body, 'Review findings')).toContain(
      '| R1: waits on time, not on the response | blocker | test-developer-ui |'
    )
    expect(section(body, 'Quarantine changes')).toContain('added: | AUTH-UI-003 | #41 |')
  })

  it('keeps the template headings and none of its comments', () => {
    expect([...body.matchAll(/^## (.+)$/gm)].map(match => match[1])).toEqual([
      'Request',
      'Summary',
      'CI results',
      'Allure evidence',
      'Coverage report',
      'Bug issues',
      'Review findings',
      'Quarantine changes',
      'Human approval'
    ])
    expect(body).not.toContain('<!--')
  })

  it('shows the GitHub Actions checks once CI exists', () => {
    const withCi = renderPrBody(
      TEMPLATE,
      evidence({ ciChecks: [{ name: 'gate', state: 'SUCCESS', link: 'https://example.test/1' }] })
    )

    expect(section(withCi, 'CI results')).toBe(
      '| Check | State |\n|---|---|\n| [gate](https://example.test/1) | SUCCESS |'
    )
  })

  it('says so when the request has no issue', () => {
    const local = renderPrBody(
      TEMPLATE,
      evidence({
        requestIssue: null,
        bugs: [],
        localBugDrafts: 0,
        findings: [],
        quarantineChanges: []
      })
    )

    expect(section(local, 'Request')).toBe(
      'Local request (no issue): Session expiry and the re-auth dialog'
    )
    expect(section(local, 'Bug issues')).toBe('- No product bugs filed.')
    expect(section(local, 'Review findings')).toBe('No findings.')
    expect(section(local, 'Quarantine changes')).toBe('None.')
  })
})
