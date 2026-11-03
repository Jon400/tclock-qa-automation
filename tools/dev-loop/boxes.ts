import type { StageId } from './state'

// The guide's architecture, box by box, as the driver prints it. Between two boxes the
// driver checks the hand-off in code (↳) before the next box starts.

export interface Box {
  stage: string
  name: string
  owner: string
  does: string
  handOff: string
  gate?: string
}

export const BOXES: Partial<Record<StageId, Box>> = {
  request: {
    stage: '0',
    name: 'User story / feature request',
    owner: 'orchestrator (prompt runs only)',
    does: 'drafts .orchestrate/request-draft.md in the test-request format; unstated criteria are marked (inferred)',
    handOff: 'the draft parses as a test request with at least one numbered criterion',
    gate: '✋ Gate 0: the owner edits and approves the draft; the driver files it as the request issue'
  },
  intake: {
    stage: '–',
    name: 'Intake + preflight',
    owner: 'driver',
    does: 'gh issue view --json → .orchestrate/request.json; branch test/<area>; clean tree, gh auth, settings, dev health, fresh .auth/',
    handOff: 'request.json is valid (zod)'
  },
  scope: {
    stage: '1',
    name: 'Orchestrator Agent',
    owner: 'orchestrator',
    does: 'analyses scope, assigns stages, tracks dependencies, sets lane file ownership → .plan/NNN + task graph',
    handOff: 'the task graph matches its schema; every acceptance criterion is assigned to an area'
  },
  'plan-tests': {
    stage: '2',
    name: 'Test Planner',
    owner: 'test-planner',
    does: 'explores the area (Playwright MCP) → .doc/sut/<area>.md, .test/<area>/test-plan.md + execution-plan.md',
    handOff: 'both parse; every criterion is covered or deferred with a reason (≤2 retries)',
    gate: '✋ Gate A: the owner approves the plan, the test plan, the execution plan and any deferral'
  },
  framework: {
    stage: '3',
    name: 'Framework Architect',
    owner: 'framework-architect (only when the task graph needs it)',
    does: 'interfaces first: fixtures, settings, page objects, clients, schemas, matchers, unit tests',
    handOff: 'gate subset: config guard, tsc, ESLint, Vitest'
  },
  implement: {
    stage: '4',
    name: 'Test Developer',
    owner: 'test-developer-ui ∥ test-developer-api',
    does: 'UI + E2E specs ∥ API specs, using only fixtures, pages, clients and matchers; framework requests go back to stage 3 (≤2)',
    handOff: 'every changed file is inside its lane'
  },
  gate: {
    stage: '5',
    name: 'Quality gate',
    owner: 'driver (tools/gates)',
    does: 'tsc, ESLint, Prettier, --list, Vitest, traceability, integrity, config guard, secretlint → .orchestrate/gate.json',
    handOff: 'the exit code is the verdict'
  },
  review: {
    stage: '6',
    name: 'Code Reviewer',
    owner: 'code-reviewer',
    does: 'architecture, quality, safety on the combined diff; findings → owning agent → re-gate → re-review (≤2 rounds)',
    handOff: 'no open blocker and the gate is green'
  },
  run: {
    stage: '7',
    name: 'Test Runner',
    owner: 'driver',
    does: 'setup → smoke (entry) → area → new cases × newCaseRepeat → .orchestrate/runs/<run-id>/',
    handOff: 'every step wrote its results'
  },
  classify: {
    stage: '8',
    name: 'Failure Analyzer',
    owner: 'driver rules → owner triage (phase 1) / failure-analyzer (phase 2)',
    does: 'env and flaky by rule; everything else labelled test bug or product bug; test bugs back to their agent (≤2)',
    handOff: 'no untriaged failure; every product bug has a bug draft',
    gate: '✋ Gate B: the owner approves each bug draft and each quarantine proposal'
  },
  bugs: {
    stage: '9',
    name: 'Bug issues',
    owner: 'driver',
    does: 'secretlint each approved draft, then gh issue create (or comment on the open issue for the case)',
    handOff: 'area exit criteria met over the cases that are not quarantined',
    gate: '✋ Gate C: the owner approves the commit and the pull request'
  },
  deliver: {
    stage: '10',
    name: 'Validated Pull Request',
    owner: 'driver',
    does: 'commit → regression → gh pr create --body-file (Closes #<request>) → link it on the request issue; merge stays manual',
    handOff:
      'the PR carries CI results, Allure evidence, coverage, bug issues and the owner approval'
  }
}

const GATE_NAMES: Partial<Record<StageId, string>> = {
  'gate-0': 'Gate 0',
  'gate-a': 'Gate A',
  'gate-b': 'Gate B',
  'gate-c': 'Gate C'
}

// A stage this run does not execute (a --request-file run has no stage 0; --from-stage skips
// what came before), so the printout still shows the whole architecture.
export function printSkipped(id: StageId, reason: string, log: (line: string) => void): void {
  const box = BOXES[id]
  log('')
  log(
    box
      ? `━━ ${box.stage.padStart(2)} │ ${box.name} ── skipped: ${reason}`
      : `✋ ${GATE_NAMES[id] ?? id} ── skipped: ${reason}`
  )
}

export function printBox(id: StageId, log: (line: string) => void): void {
  const box = BOXES[id]
  if (!box) return
  log('')
  log(`━━ ${box.stage.padStart(2)} │ ${box.name} ── ${box.owner}`)
  log(`      ${box.does}`)
  log(`   ↳ ${box.handOff}`)
}
