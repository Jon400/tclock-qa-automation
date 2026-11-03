import { describe, expect, it } from 'vitest'
import {
  criterionLabel,
  parseTestRequest,
  RequestError,
  RequestSchema
} from '../../../tools/dev-loop/intake'
import { fixture, sampleRequest } from './fixtures'

function problemsOf(parse: () => unknown): string[] {
  try {
    parse()
  } catch (error) {
    if (error instanceof RequestError) return error.problems
    throw error
  }
  return []
}

describe('test request parser', () => {
  it('turns the local fixture into a valid request.json', () => {
    const request = sampleRequest()

    expect(RequestSchema.parse(request)).toEqual(request)
    expect(request).toMatchObject({
      issue: null,
      title: 'Session expiry and the re-auth dialog',
      area: 'auth',
      roles: ['operator'],
      outOfScope: ['Changing how long a session lasts.'],
      links: []
    })
    expect(request.acceptanceCriteria.map(criterion => criterion.number)).toEqual([1, 2, 3, 4])
    expect(request.acceptanceCriteria.some(criterion => criterion.inferred)).toBe(false)
  })

  it('reads an issue body: template comments dropped, the title from the issue', () => {
    const issue = JSON.parse(fixture('gh/issue-view.json')) as {
      body: string
      title: string
      url: string
    }
    const request = parseTestRequest(issue.body, {
      issue: 12,
      url: issue.url,
      title: issue.title,
      allowInferred: false
    })

    expect(request).toMatchObject({
      issue: 12,
      url: issue.url,
      area: 'auth',
      title: 'Session expiry and the re-auth dialog'
    })
    expect(request.acceptanceCriteria).toHaveLength(2)
  })

  it('accepts a recorded orchestrator draft before Gate 0, with its inferred criteria marked', () => {
    const draft = parseTestRequest(fixture('request-draft.md'), { allowInferred: true })

    expect(draft.acceptanceCriteria.map(criterion => criterion.inferred)).toEqual([
      false,
      true,
      true
    ])
    expect(draft.acceptanceCriteria[1]?.text).toBe(
      'Confirming the passkey in the dialog completes the action that was interrupted.'
    )
  })

  it('refuses a draft that still has an (inferred) mark after Gate 0', () => {
    expect(
      problemsOf(() => parseTestRequest(fixture('request-draft.md'), { allowInferred: false }))
    ).toEqual(['criteria 2, 3 are still marked (inferred): confirm or delete each one'])
  })

  it('refuses a draft without a numbered criterion', () => {
    const markdown = fixture('request-draft.md').replace(/^\d+\. /gm, '- ')

    expect(problemsOf(() => parseTestRequest(markdown, { allowInferred: true }))).toContain(
      'acceptanceCriteria: at least one numbered acceptance criterion is required'
    )
  })

  it('refuses criteria that are not numbered 1, 2, 3', () => {
    const markdown = fixture('test-request.md').replace(/^2\. /m, '5. ')

    expect(problemsOf(() => parseTestRequest(markdown, { allowInferred: false }))).toContain(
      'acceptance criteria must be numbered 1, 2, 3...; found 5 at position 2'
    )
  })

  it('names each missing section and a bad area slug', () => {
    const markdown =
      '# A title\n\n## User story\n\nAs someone.\n\n## Acceptance criteria\n\n1. One thing.\n\n## Area\n\nEmployee Report\n'
    const problems = problemsOf(() => parseTestRequest(markdown, { allowInferred: false }))

    expect(problems).toContain('missing the "## Roles involved" section')
    expect(problems).toContain('area: the area must be a kebab-case slug, e.g. employee-report')
    expect(problems).toContain('roles: name at least one role')
  })

  it('labels a criterion with its issue, or "local" without one', () => {
    expect(criterionLabel(sampleRequest(12), 3)).toBe('#12 AC 3')
    expect(criterionLabel(sampleRequest(), 1)).toBe('#local AC 1')
  })
})
