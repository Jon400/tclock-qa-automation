import { describe, expect, it } from 'vitest'
import { addBacklogLine, linkBacklogLine, nextBacklogItem } from '../../../tools/dev-loop/backlog'
import {
  TaskGraphError,
  validateTaskGraph,
  type TaskGraph
} from '../../../tools/dev-loop/task-graph'
import { fixture, sampleRequest } from './fixtures'

function sampleGraph(): TaskGraph {
  return JSON.parse(fixture('task-graph.json')) as TaskGraph
}

function problemsOf(graph: unknown): string[] {
  try {
    validateTaskGraph(graph, sampleRequest())
  } catch (error) {
    if (error instanceof TaskGraphError) return error.problems
    throw error
  }
  return []
}

describe('task graph', () => {
  it('accepts the sample graph for the sample request', () => {
    expect(problemsOf(sampleGraph())).toEqual([])
  })

  it("needs every criterion assigned exactly once, and only the request's criteria", () => {
    const graph = sampleGraph()
    graph.criteria = [
      { number: 1, area: 'auth' },
      { number: 1, area: 'auth' },
      { number: 2, area: 'auth' },
      { number: 3, area: 'auth' },
      { number: 7, area: 'auth' }
    ]

    expect(problemsOf(graph)).toEqual([
      'acceptance criterion 1 is assigned 2 times (needs exactly 1)',
      'acceptance criterion 4 is assigned 0 times (needs exactly 1)',
      'criterion 7 is not in the request'
    ])
  })

  it("keeps each task inside its agent's lane", () => {
    const graph = sampleGraph()
    graph.tasks
      .find(task => task.id === 'ui-cases')
      ?.writes.push('src/ui/pages/login-page.ts', '.test/quarantine.md')

    const problems = problemsOf(graph)
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(
      /^task "ui-cases" \(test-developer-ui\) cannot write src\/ui\/pages\/login-page.ts: .*outside the test-developer-ui lane/
    )
    expect(problems[1]).toMatch(/cannot write .test\/quarantine.md: .*owner-only/)
  })

  it('rejects unknown dependencies and cycles', () => {
    const graph = sampleGraph()
    const planTests = graph.tasks.find(task => task.id === 'plan-tests')
    planTests?.dependsOn.push('review', 'nowhere')

    expect(problemsOf(graph)).toEqual([
      'task "plan-tests" depends on unknown task "nowhere"',
      'task dependencies form a cycle'
    ])
  })

  it('needs a test planner and a reviewer, and frameworkNeeded to match the tasks', () => {
    const graph = sampleGraph()
    graph.tasks = graph.tasks.filter(
      task => task.agent !== 'code-reviewer' && task.agent !== 'framework-architect'
    )

    expect(problemsOf(graph)).toEqual([
      'task "ui-cases" depends on unknown task "expire-session"',
      'task "api-cases" depends on unknown task "expire-session"',
      'no code-reviewer task',
      'frameworkNeeded must be true exactly when a framework-architect task exists'
    ])
  })

  it('checks the schema first', () => {
    expect(problemsOf({ ...sampleGraph(), plan: 'plan.md', tasks: [] })).toEqual([
      'plan: plan must be .plan/NNN-YYYY-MM-DD-topic.md',
      'tasks: Too small: expected array to have >=1 items'
    ])
  })
})

const BACKLOG = [
  '# Prioritized Backlog',
  '',
  'Current queue:',
  '- [x] done already | plan:001',
  '- [ ] auth: session expiry and the re-auth dialog | issue:#12',
  '- [ ] employee-report lifecycle',
  '',
  '## DONE',
  '- [x] Setup'
].join('\n')

describe('backlog', () => {
  it('takes the first unchecked line of the current queue, with its issue', () => {
    expect(nextBacklogItem(BACKLOG)).toEqual({
      line: 5,
      title: 'auth: session expiry and the re-auth dialog',
      issue: 12
    })
  })

  it('reports a line without an issue', () => {
    expect(nextBacklogItem(BACKLOG.replace(' | issue:#12', ''))?.issue).toBeUndefined()
  })

  it('adds a filed request at the end of the current queue', () => {
    const lines = addBacklogLine(BACKLOG, 'user: provision, edit, deactivate', 14).split('\n')

    expect(lines.slice(4, 8)).toEqual([
      '- [ ] auth: session expiry and the re-auth dialog | issue:#12',
      '- [ ] employee-report lifecycle',
      '- [ ] user: provision, edit, deactivate | issue:#14',
      ''
    ])
  })

  it('passes over lines that are not requests: framework work, CI, phase 2', () => {
    const markdown = BACKLOG.replace(
      '- [x] done already | plan:001',
      [
        '- [ ] QA framework foundation | plan:001',
        '- [ ] CI: GitHub Actions workflows',
        '- [ ] Phase 2: the failure-analyzer'
      ].join('\n')
    ).replace(' | issue:#12', '')

    expect(nextBacklogItem(markdown)).toEqual({
      line: 7,
      title: 'auth: session expiry and the re-auth dialog',
      issue: undefined
    })
  })

  it('links the issue filed at Gate 0 to the line a --next run started from', () => {
    const markdown = BACKLOG.replace(' | issue:#12', '')

    expect(linkBacklogLine(markdown, 5, 15).split('\n')[4]).toBe(
      '- [ ] auth: session expiry and the re-auth dialog | issue:#15'
    )
    expect(() => linkBacklogLine(BACKLOG, 5, 15)).toThrow(/not an unchecked line without an issue/)
  })
})
