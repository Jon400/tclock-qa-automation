import { describe, expect, it } from 'vitest'
import { bugTitle, fileBug, renderBugDraft, type BugContext } from '../../../tools/dev-loop/bug'
import type { Failure } from '../../../tools/dev-loop/classify'
import { GitHub } from '../../../tools/dev-loop/github'
import { redact } from '../../../tools/dev-loop/redact'
import { parseTestPlan } from '../../../tools/gates/parsers/test-plan'
import { fixture, recordedGh, repoFile } from './fixtures'

const TEMPLATE = repoFile('.github/ISSUE_TEMPLATE/bug-report.md')
const AUTH_PLAN = parseTestPlan(
  repoFile('.test/auth/test-plan.md'),
  'auth',
  '.test/auth/test-plan.md'
)
const LOGOUT = AUTH_PLAN.cases.find(plannedCase => plannedCase.id === 'AUTH-UI-003')

const COOKIE_VALUE = 'ZXhhbXBsZS1zZXNzaW9uLXZhbHVl0123'
const FAILURE: Failure = {
  caseId: 'AUTH-UI-003',
  title: 'auth › Logout ends the session in the browser and on the server',
  file: 'tests/ui/auth/logout.spec.ts',
  line: 14,
  project: 'ui',
  step: 'Call GET /web/auth/session',
  errors: [
    `Error: expect(received).toBe(expected)\n\nExpected: 401\nReceived: 200\n\nRequest headers: Cookie: tclock_session=${COOKIE_VALUE}`
  ],
  tracePath:
    'C:\\Users\\someone\\dev\\tclock-qa-automation\\.orchestrate\\runs\\261016-101500-ab12\\area\\trace.zip',
  passed: 0,
  failed: 3,
  class: 'product-bug',
  reason: 'owner: product bug'
}

function context(): BugContext {
  if (!LOGOUT) throw new Error('AUTH-UI-003 is missing from the auth test plan')
  return {
    failure: FAILURE,
    plannedCase: LOGOUT,
    area: 'auth',
    role: 'QA Operator',
    requestIssue: 12,
    runId: '261016-101500-ab12',
    date: '2026-10-16',
    baseUrl: 'https://dev.tclock.co.il'
  }
}

describe('bug draft', () => {
  const draft = renderBugDraft(TEMPLATE, context())

  it('is titled [<CASE-ID>] <failing step>: <actual result>', () => {
    expect(draft.title).toBe('[AUTH-UI-003] Call GET /web/auth/session: Expected: 401')
    expect(
      bugTitle({ ...FAILURE, step: undefined, errors: ['x'.repeat(300)] }).length
    ).toBeLessThanOrEqual(120)
  })

  it('copies Steps and Expected from the test plan and puts the error under Actual', () => {
    expect(draft.body).toContain(
      '## Steps\n\nPreconditions: A fresh operator session, separate from the shared one'
    )
    expect(draft.body).toContain(
      '1. Log in as the operator in a new browser context\n2. Log out from the navbar'
    )
    expect(draft.body).toContain(
      '## Expected\n\nThe login form is shown\nThe session call returns 401'
    )
    expect(draft.body).toMatch(
      /## Actual\n\nFailing step: Call GET \/web\/auth\/session\n\n```\nError: expect\(received\)/
    )
    expect(draft.body).toContain('Failed 3 of 3 attempt(s).')
  })

  it('names the case, the request, the environment and the run', () => {
    expect(draft.body).toContain(
      '- Case: `AUTH-UI-003` — Logout ends the session in the browser and on the server'
    )
    expect(draft.body).toContain('- Request: #12')
    expect(draft.body).toContain('- Host: https://dev.tclock.co.il')
    expect(draft.body).toContain('- Run ID: `261016-101500-ab12`')
  })

  it('keeps every template heading, in order', () => {
    expect([...draft.body.matchAll(/^## (.+)$/gm)].map(match => match[1])).toEqual([
      'Case',
      'Environment',
      'Steps',
      'Expected',
      'Actual',
      'Evidence'
    ])
  })

  it('carries no cookie value, no trace content and no local user path', () => {
    expect(draft.body).not.toContain(COOKIE_VALUE)
    expect(draft.body).toContain('[redacted]')
    expect(draft.body).toContain('`.orchestrate/runs/261016-101500-ab12/area/trace.zip`')
    expect(draft.body).not.toContain('someone')
    // A trace is a zip of snapshots and resources; none of it may appear.
    for (const marker of ['PK\u0003\u0004', '"snapshots"', 'resources/']) {
      expect(draft.body).not.toContain(marker)
    }
  })
})

describe('filing a bug: the duplicate check', () => {
  it('comments on the open issue that already tracks the case', () => {
    const gh = recordedGh({
      'issue list': fixture('gh/issue-list.json'),
      'issue comment': fixture('gh/issue-comment.txt')
    })
    const outcome = fileBug(
      new GitHub({ dryRun: false, run: gh.run }),
      renderBugDraft(TEMPLATE, context()),
      '.orchestrate/bugs/AUTH-UI-003.md',
      'auth'
    )

    expect(outcome).toMatchObject({ kind: 'commented', caseId: 'AUTH-UI-003', number: 31 })
    expect(gh.calls.map(call => call.slice(0, 2).join(' '))).toEqual([
      'issue list',
      'issue comment'
    ])
    expect(gh.calls[1]).toEqual([
      'issue',
      'comment',
      '31',
      '--body-file',
      '.orchestrate/bugs/AUTH-UI-003.md'
    ])
  })

  it('files a new issue, labelled bug and area, when none is open', () => {
    const gh = recordedGh({ 'issue list': '[]', 'issue create': fixture('gh/issue-create.txt') })
    const outcome = fileBug(
      new GitHub({ dryRun: false, run: gh.run }),
      renderBugDraft(TEMPLATE, context()),
      '.orchestrate/bugs/AUTH-UI-003.md',
      'auth'
    )

    expect(outcome).toMatchObject({ kind: 'created', number: 41 })
    expect(gh.calls[1]).toContain('bug,area:auth')
  })
})

describe('redaction', () => {
  it.each([
    // Short, obviously fake values: real-looking ones would (rightly) fail the secretlint gate.
    ['a cookie header', 'Set-Cookie: sid=abc; Path=/', 'Set-Cookie: [redacted]'],
    ['a session pair', 'session_id=fake other', 'session=[redacted] other'],
    ['a phone number', 'logged in as +972-54-000-0000', 'logged in as [phone]'],
    ['a passkey field', '"privateKey": "FAKEKEY"', '"privateKey": [redacted]'],
    ['a long token', 'token Fake0Token1Value2For3Redaction4Tests5Only6', 'token [token]']
  ])('masks %s', (_name, input, expected) => {
    expect(redact(input)).toBe(expected)
  })

  it('leaves file paths and run ids alone', () => {
    const text = 'trace: .orchestrate/runs/261016-101500-ab12/area/auth-logout-ui/trace.zip'

    expect(redact(text)).toBe(text)
  })
})
