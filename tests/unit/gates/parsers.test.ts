import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT } from '../../../tools/gates/exec'
import { parseExecutionPlan } from '../../../tools/gates/parsers/execution-plan'
import { splitRow, tableAfterHeading } from '../../../tools/gates/parsers/markdown-table'
import { parseQuarantine } from '../../../tools/gates/parsers/quarantine'
import { cellLines, parseTestPlan } from '../../../tools/gates/parsers/test-plan'
import { CASES, planMarkdown, REQUIREMENTS } from './plan-fixture'

describe('markdown tables', () => {
  it('splits cells and keeps an escaped pipe', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b | c', 'd'])
  })

  it('finds the table under a heading and stops at the next heading', () => {
    expect(tableAfterHeading('## A\n\n## B\n\n| x |\n|---|\n| 1 |\n', 'A')).toBeUndefined()
    expect(tableAfterHeading('## B\ntext\n| x |\n|---|\n| 1 |\n', 'B')?.rows).toEqual([
      { line: 5, cells: { x: '1' } }
    ])
  })
})

describe('test plan parser', () => {
  it('parses both tables of a valid plan', () => {
    const plan = parseTestPlan(planMarkdown(), 'demo', '.test/demo/test-plan.md')

    expect(plan.errors).toEqual([])
    expect(plan.requirements.map(requirement => requirement.id)).toEqual([
      'DEMO-AC-01',
      'DEMO-AC-02'
    ])
    expect(plan.cases[0]).toMatchObject({
      id: 'DEMO-UI-001',
      covers: ['DEMO-AC-01'],
      layer: 'ui',
      priority: 'P1'
    })
    expect(cellLines(plan.cases[0]?.steps ?? '')).toEqual(['1. Open', '2. Click'])
  })

  it('parses the real auth plan without errors', () => {
    const markdown = readFileSync(path.join(REPO_ROOT, '.test/auth/test-plan.md'), 'utf8')
    const plan = parseTestPlan(markdown, 'auth', '.test/auth/test-plan.md')

    expect(plan.errors).toEqual([])
    expect(plan.requirements).toHaveLength(5)
    expect(plan.cases).toHaveLength(5)
  })

  it('reports a duplicate case ID', () => {
    const plan = parseTestPlan(
      planMarkdown(REQUIREMENTS, [...CASES, CASES[0] ?? '']),
      'demo',
      'plan.md'
    )

    expect(plan.errors).toEqual([expect.stringContaining('duplicate case ID DEMO-UI-001')])
  })

  it('reports a duplicate requirement ID', () => {
    const plan = parseTestPlan(
      planMarkdown([...REQUIREMENTS, REQUIREMENTS[0] ?? '']),
      'demo',
      'plan.md'
    )

    expect(plan.errors).toEqual([expect.stringContaining('duplicate requirement ID DEMO-AC-01')])
  })

  it('needs a reason to defer a requirement', () => {
    const plan = parseTestPlan(
      planMarkdown(['| DEMO-AC-01 | x | #1 | deferred |']),
      'demo',
      'plan.md'
    )

    expect(plan.errors).toContainEqual(expect.stringContaining('deferred without a reason'))
  })

  it('accepts a deferred requirement with a reason', () => {
    const plan = parseTestPlan(
      planMarkdown([
        '| DEMO-AC-01 | x | #1 | covered |',
        '| DEMO-AC-02 | y | #1 | deferred: needs a second company |'
      ]),
      'demo',
      'plan.md'
    )

    expect(plan.requirements[1]).toMatchObject({
      status: 'deferred',
      deferReason: 'needs a second company'
    })
  })

  it.each([
    ['a layer that contradicts the ID', CASES[0]?.replace('| ui |', '| api |'), 'its ID says "ui"'],
    ['an unknown priority', CASES[0]?.replace('| P1 |', '| P0 |'), 'priority "P0"'],
    [
      'an unknown automation intent',
      CASES[0]?.replace('| planned |', '| done |'),
      'automation "done"'
    ],
    [
      'a case from another area',
      CASES[0]?.replaceAll('DEMO-UI-001', 'OTHER-UI-001'),
      'belongs to area "other"'
    ],
    ['a malformed ID', CASES[0]?.replace('DEMO-UI-001', 'DEMO-UI-1'), 'is not a case ID']
  ])('reports %s', (_name, row, message) => {
    const plan = parseTestPlan(planMarkdown(REQUIREMENTS, [row ?? '']), 'demo', 'plan.md')

    expect(plan.errors).toContainEqual(expect.stringContaining(message))
  })

  it('reports a missing table and wrong columns', () => {
    expect(parseTestPlan('# nothing', 'demo', 'plan.md').errors).toEqual([
      'plan.md: missing "## Requirements" table',
      'plan.md: missing "## Test Cases" table'
    ])
    const wrongColumns = planMarkdown().replace(
      '| ID | Requirement | Source | Status |',
      '| ID | Requirement | Status |'
    )
    expect(parseTestPlan(wrongColumns, 'demo', 'plan.md').errors).toContainEqual(
      expect.stringContaining('must have the columns')
    )
  })
})

describe('execution plan parser', () => {
  it('reads the real auth front matter', () => {
    const markdown = readFileSync(path.join(REPO_ROOT, '.test/auth/execution-plan.md'), 'utf8')

    expect(parseExecutionPlan(markdown)).toEqual({
      area: 'auth',
      grep: '@auth',
      newCaseRepeat: 3,
      serial: false,
      dependsOnProfiles: ['smoke'],
      exit: { p1PassRate: 100, overallPassRate: 100, maxNewFlaky: 0, untriagedFailures: 0 }
    })
  })

  it('fills defaults for an area that only names itself', () => {
    expect(parseExecutionPlan('---\narea: user\ngrep: "@user"\n---\n')).toMatchObject({
      newCaseRepeat: 3,
      serial: false
    })
  })

  it('rejects a missing front matter, a grep for another area, and untriaged failures', () => {
    expect(() => parseExecutionPlan('# no front matter')).toThrow(/front matter/)
    expect(() => parseExecutionPlan('---\narea: user\ngrep: "@auth"\n---\n')).toThrow(
      /grep must be "@user"/
    )
    expect(() =>
      parseExecutionPlan('---\narea: user\ngrep: "@user"\nexit:\n  untriagedFailures: 2\n---\n')
    ).toThrow()
  })
})

describe('quarantine registry parser', () => {
  const registry = (rows: string[]) =>
    [
      '## Registry',
      '',
      '| Case ID | Issue | Reason | Approved by | Date |',
      '|---|---|---|---|---|',
      ...rows
    ].join('\n')

  it('reads entries', () => {
    const { entries, errors } = parseQuarantine(
      registry(['| AUTH-UI-003 | #12 | product bug | Jon400 | 2026-10-16 |'])
    )

    expect(errors).toEqual([])
    expect(entries).toEqual([expect.objectContaining({ caseId: 'AUTH-UI-003', issue: '#12' })])
  })

  it('needs a linked issue', () => {
    expect(
      parseQuarantine(registry(['| AUTH-UI-003 | soon | flaky | Jon400 | 2026-10-16 |'])).errors
    ).toEqual([expect.stringContaining('must link its bug issue')])
  })

  it('reads the real, empty registry', () => {
    const markdown = readFileSync(path.join(REPO_ROOT, '.test/quarantine.md'), 'utf8')

    expect(parseQuarantine(markdown)).toEqual({ entries: [], errors: [] })
  })
})
