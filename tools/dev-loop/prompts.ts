import type { TestRequest } from './intake'
import type { TaskGraph } from './task-graph'

// The job-specific part of each agent stage. Who the agent is, what it may touch and how it
// works lives in its definition (.claude/agents/<name>.md) and the skills it names; the
// prompt only says which job, with which inputs. Every agent ends with the JSON summary the
// driver asked for.

const footer =
  'When you are finished, return the JSON summary the driver asked for. status "blocked" plus a summary explains what stopped you.'

// A retry names exactly what the hand-off check rejected.
const rejected = (problems: string[]) =>
  problems.length
    ? [
        '',
        'Your previous attempt was rejected. Fix exactly these problems:',
        ...problems.map(problem => `- ${problem}`)
      ]
    : []

export function requestDraftPrompt(ownerPrompt: string): string {
  return [
    'Job: draft a test request (stage 0).',
    '',
    `The owner's prompt: """${ownerPrompt}"""`,
    '',
    'Read .doc/sut-overview.md and, when it exists, .doc/sut/<area>.md for the area the prompt is about.',
    'Write .orchestrate/request-draft.md: a "# <title>" line, then exactly the sections of',
    '.github/ISSUE_TEMPLATE/test-request.md (User story, Acceptance criteria, Area, Roles involved,',
    'Out of scope, Links), without the template front matter or comments.',
    'Number the acceptance criteria 1, 2, 3... Mark every criterion the prompt does not state with "(inferred)".',
    'Do not explore the app and do not write anything else.',
    footer
  ].join('\n')
}

export function scopePrompt(
  request: TestRequest,
  nextPlanNumber: string,
  today: string,
  problems: string[] = []
): string {
  return [
    'Job: scope the request (stage 1).',
    '',
    'Inputs: .orchestrate/request.json (the request), AGENTS.md, .test/master-test-plan.md, the existing .plan/*.md,',
    `and .test/${request.area}/ when it exists.`,
    '',
    `1. Write the implementation plan .plan/${nextPlanNumber}-${today}-<topic>.md with the writing-plans skill. It links`,
    `   request ${request.issue ? `#${request.issue}` : '(local request)'} and the area's .test/ files instead of listing test cases.`,
    '2. Write .orchestrate/task-graph.json: { request, plan, criteria: [{ number, area }], frameworkNeeded, tasks: [{ id,',
    '   agent, dependsOn, summary, writes }] }. Assign every acceptance criterion to exactly one area. Agents are',
    '   test-planner, framework-architect (only when src/, fixtures or config must change), test-developer-ui,',
    '   test-developer-api, code-reviewer. "writes" lists paths inside that agent\'s lane only.',
    ...rejected(problems),
    footer
  ].join('\n')
}

export function testPlanPrompt(
  request: TestRequest,
  graph: TaskGraph,
  problems: string[] = []
): string {
  return [
    'Job: plan the tests for this request (stage 2).',
    '',
    `Inputs: .orchestrate/request.json, .orchestrate/task-graph.json, ${graph.plan}, .test/master-test-plan.md,`,
    `.test/README.md, and the existing .test/${request.area}/ and .doc/sut/${request.area}.md when they exist.`,
    '',
    `Explore the ${request.area} area with your Playwright MCP tools (dev host only), as the exploring-the-sut skill says.`,
    `Then write .doc/sut/${request.area}.md, .test/${request.area}/test-plan.md and .test/${request.area}/execution-plan.md`,
    'with the writing-test-plans skill.',
    `Every request criterion becomes a requirement row whose Source is "#${request.issue ?? 'local'} AC <n>", covered by`,
    'cases or deferred with a reason. Keep existing rows and IDs; add new ones after them.',
    ...rejected(problems),
    footer
  ].join('\n')
}

export function frameworkPrompt(
  request: TestRequest,
  graph: TaskGraph,
  input: { requests?: string[]; gateFailures?: string[] } = {}
): string {
  const tasks = graph.tasks.filter(task => task.agent === 'framework-architect')
  return [
    'Job: framework work for this request (stage 3). Define the interfaces before the test developers start.',
    '',
    `Inputs: ${graph.plan}, .test/${request.area}/test-plan.md, .doc/sut/${request.area}.md, .orchestrate/task-graph.json.`,
    ...tasks.map(task => `Task ${task.id}: ${task.summary}`),
    ...(input.requests?.length
      ? [
          '',
          'Framework requests from the test developers:',
          ...input.requests.map(item => `- ${item}`)
        ]
      : []),
    ...(input.gateFailures?.length
      ? ['', 'The gate subset failed. Fix these:', ...input.gateFailures.map(item => `- ${item}`)]
      : []),
    '',
    'Add unit tests for new framework logic. Run npx tsc --noEmit, npx eslint . and npx vitest run before you finish.',
    'Write .orchestrate/framework-architect-report.md: what each new interface is for.',
    footer
  ].join('\n')
}

export function developerPrompt(
  lane: 'ui' | 'api',
  request: TestRequest,
  graph: TaskGraph,
  notes: string[] = []
): string {
  const role = `test-developer-${lane}`
  const tasks = graph.tasks.filter(task => task.agent === role)
  const folders =
    lane === 'ui'
      ? `tests/ui/${request.area}/ and tests/e2e/${request.area}/`
      : `tests/api/${request.area}/`
  return [
    `Job: implement the ${lane === 'ui' ? 'UI and E2E' : 'API'} cases of this request (stage 4). Your lane is ${role}.`,
    '',
    `Inputs: .test/${request.area}/test-plan.md (the cases), ${graph.plan}, .orchestrate/framework-architect-report.md when it exists.`,
    ...tasks.map(task => `Task ${task.id}: ${task.summary}`),
    `Implement every "planned" case of your layer as one test with testCase('<CASE-ID>') in ${folders}.`,
    'Use only fixtures, page objects, components, clients and matchers. If one is missing, do not work around it:',
    'return it under frameworkRequests and leave that case for the next round.',
    ...(notes.length ? ['', 'Address these first:', ...notes.map(note => `- ${note}`)] : []),
    '',
    `Run npx playwright test --list, npx tsc --noEmit and npx eslint ${folders.split(' and ')[0]} before you finish.`,
    footer
  ].join('\n')
}

export function reviewPrompt(request: TestRequest, graph: TaskGraph, round: number): string {
  return [
    `Job: review the combined change for this request (stage 6, round ${round}).`,
    '',
    `Inputs: git diff (the working tree against main), .orchestrate/gate.json, ${graph.plan},`,
    `.test/${request.area}/test-plan.md, .test/master-test-plan.md.`,
    'Use the reviewing-code skill. Write .orchestrate/review-report.md and return every finding with its owning agent.',
    footer
  ].join('\n')
}

export function repairPrompt(role: string, request: TestRequest, items: string[]): string {
  return [
    `Job: repair round for the ${role} lane (request area ${request.area}).`,
    '',
    'Fix exactly these findings. Never weaken, remove or change an existing assertion to make a test pass:',
    'the gate fails any edited expect( line in a spec that exists on main.',
    ...items.map(item => `- ${item}`),
    '',
    'Run the checks for your lane again before you finish.',
    footer
  ].join('\n')
}
