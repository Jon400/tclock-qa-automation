import { spawnSync } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { ROLES } from '../../src/config/enum'
import { runDir } from '../../src/config/paths'
import { DEFAULT_BASE_URL, loadSettings, requirePhone } from '../../src/config/settings'
import { createRunId } from '../../src/data/run-id'
import { exists, readJson, readText, writeJson, writeText } from '../../src/utils/file-utils'
import { scanTextForSecrets } from '../gates/checks/processes'
import { git, NODE_BIN, REPO_ROOT } from '../gates/exec'
import { loadQuarantine, loadTestPlans } from '../gates/load'
import { parseExecutionPlan, type ExecutionPlan } from '../gates/parsers/execution-plan'
import { parseTestPlan, type PlannedCase, type TestPlan } from '../gates/parsers/test-plan'
import { FRAMEWORK_SUBSET, type CheckId } from '../gates/run-gate'
import { listTests } from '../gates/test-inventory'
import type { GateResult } from '../gates/types'
import {
  DeveloperOutput,
  FrameworkOutput,
  RepairOutput,
  RequestDraftOutput,
  ReviewOutput,
  ScopeOutput,
  TestPlanOutput,
  type AgentRole,
  type AgentRunner
} from './agents'
import { addBacklogLine, linkBacklogLine, nextBacklogItem } from './backlog'
import { printBox, printSkipped } from './boxes'
import { fileBug, renderBugDraft, type FilingOutcome } from './bug'
import { countByClass, type Failure } from './classify'
import type { GitHub } from './github'
import {
  activateStatus,
  addRouted,
  areaCoverage,
  commitSubject,
  deferredCriteria,
  emptyRouting,
  gateFailureLines,
  newCaseIds,
  nextPlanNumber,
  ownerOfPath,
  quarantineChanges,
  REPAIR_ROLES,
  routeGateFailures,
  testPlanProblems,
  titleWithoutArea,
  type Routed
} from './handoff'
import {
  INFERRED_MARK,
  parseTestRequest,
  RequestError,
  RequestSchema,
  type TestRequest
} from './intake'
import { changedSince, laneViolations, snapshotTree } from './lanes'
import { choose, ownerGate, type OwnerIO } from './owner'
import { renderPrBody, type PrEvidence, type ReviewFinding } from './pr'
import {
  developerPrompt,
  frameworkPrompt,
  repairPrompt,
  requestDraftPrompt,
  reviewPrompt,
  scopePrompt,
  testPlanPrompt
} from './prompts'
import { redact } from './redact'
import {
  buildAllureReport,
  commandLine,
  evaluateExitCriteria,
  healthCheck,
  profileSteps,
  runStep,
  summarizeRun,
  type RunStep,
  type RunSummary
} from './runner'
import {
  saveState as writeState,
  loadState,
  STAGE_IDS,
  type LoopState,
  type StageId
} from './state'
import { areasOf, TaskGraphError, validateTaskGraph, type TaskGraph } from './task-graph'

// The dev loop's stage machine, one method per box of the architecture (boxes.ts):
// - code checks every hand-off (↳) before the next box starts;
// - every repair loop stops after MAX_RETRIES rounds and hands over to the owner;
// - every owner gate (✋) waits for an answer in the terminal;
// - each stage reads its inputs from .orchestrate/, so --from-stage can resume a run.
// Under --dry-run every stage, gate, git write and gh write is printed instead of run, and no
// agent is spawned.

export type LoopSource =
  // backlogLine: a --next run whose line had no issue yet; Gate 0 links the issue to it.
  | { kind: 'prompt'; prompt: string; backlogLine?: number }
  | { kind: 'issue'; issue: number }
  // Resolved at the start into an issue run, or a prompt run for a line without an issue.
  | { kind: 'next' }
  | { kind: 'file'; file: string }
  // --from-stage past intake: the request is .orchestrate/request.json.
  | { kind: 'resume' }

export interface LoopOptions {
  source: LoopSource
  dryRun: boolean
  fromStage?: StageId | undefined
}

export interface LoopDeps {
  io: OwnerIO
  github: GitHub
  agents: AgentRunner
  log: (line: string) => void
  now?: () => Date
}

// Stops the run with a message for the owner. The state is saved, so --from-stage resumes it.
export class StopLoop extends Error {
  constructor(
    message: string,
    readonly details: string[] = []
  ) {
    super(message)
    this.name = 'StopLoop'
  }
}

// Every "≤2" in the architecture: test-plan retries, framework requests, review repair
// rounds, test-bug repair rounds.
export const MAX_RETRIES = 2

// A dry run validates this sample in place of the orchestrator's task graph.
export const SAMPLE_TASK_GRAPH = 'tests/unit/fixtures/task-graph.json'

interface Caps {
  maxTurns: number
  maxBudgetUsd: number
}

// Per agent call. A call that hits a cap fails its stage; only the owner raises a cap.
const CAPS = {
  request: { maxTurns: 20, maxBudgetUsd: 1 },
  scope: { maxTurns: 40, maxBudgetUsd: 3 },
  planTests: { maxTurns: 150, maxBudgetUsd: 10 },
  framework: { maxTurns: 100, maxBudgetUsd: 6 },
  implement: { maxTurns: 100, maxBudgetUsd: 6 },
  review: { maxTurns: 40, maxBudgetUsd: 3 },
  repair: { maxTurns: 60, maxBudgetUsd: 4 }
} satisfies Record<string, Caps>

interface Label {
  name: string
  color: string
  description: string
}

const LABEL = {
  testRequest: {
    name: 'test-request',
    color: '0e8a16',
    description: 'What to test: starts one dev-loop run'
  },
  bug: { name: 'bug', color: 'd73a4a', description: 'A product bug found by a planned test case' },
  area: (area: string): Label => ({
    name: `area:${area}`,
    color: '1d76db',
    description: `The ${area} area`
  })
}

const LANES = ['ui', 'api'] as const

const ORCHESTRATE = path.join(REPO_ROOT, '.orchestrate')
const FILE = {
  draft: path.join(ORCHESTRATE, 'request-draft.md'),
  request: path.join(ORCHESTRATE, 'request.json'),
  taskGraph: path.join(ORCHESTRATE, 'task-graph.json'),
  testPlanSummary: path.join(ORCHESTRATE, 'test-plan-summary.json'),
  gate: path.join(ORCHESTRATE, 'gate.json'),
  findings: path.join(ORCHESTRATE, 'review-findings.json'),
  drafts: path.join(ORCHESTRATE, 'bugs', 'drafts.json'),
  filed: path.join(ORCHESTRATE, 'bugs', 'filed.json'),
  comments: path.join(ORCHESTRATE, 'comments'),
  prBody: path.join(ORCHESTRATE, 'pr-body.md'),
  backlog: path.join(REPO_ROOT, '.plan', '000-backlog.md'),
  bugTemplate: path.join(REPO_ROOT, '.github', 'ISSUE_TEMPLATE', 'bug-report.md'),
  prTemplate: path.join(REPO_ROOT, '.github', 'pull_request_template.md'),
  quarantine: '.test/quarantine.md'
}

// ── files the loop keeps between stages ─────────────────────────────────────────────────────

const DraftSchema = z.object({
  caseId: z.string(),
  area: z.string(),
  title: z.string(),
  file: z.string(),
  kind: z.enum(['product-bug', 'flaky']),
  decision: z.enum(['pending', 'file', 'local', 'drop'])
})
type Draft = z.infer<typeof DraftSchema>

const FindingSchema = z.object({
  id: z.string(),
  severity: z.enum(['blocker', 'should-fix', 'nit']),
  owner: z.string(),
  file: z.string(),
  message: z.string(),
  resolution: z.string()
}) satisfies z.ZodType<ReviewFinding>

const FiledSchema = z.object({
  kind: z.enum(['created', 'commented']),
  caseId: z.string(),
  number: z.number().int(),
  url: z.string()
}) satisfies z.ZodType<FilingOutcome>

const GateFileSchema = z.object({
  ok: z.boolean(),
  startedAt: z.string(),
  durationMs: z.number(),
  base: z.string(),
  allowAssertionChange: z.boolean(),
  checks: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      status: z.enum(['passed', 'failed', 'skipped']),
      summary: z.string(),
      details: z.array(z.string()),
      durationMs: z.number().optional()
    })
  )
}) satisfies z.ZodType<GateResult>

async function readIfExists<T>(file: string, schema: z.ZodType<T>, fallback: T): Promise<T> {
  return (await exists(file)) ? readJson(file, schema) : fallback
}

async function readFailures(runId: string): Promise<Failure[]> {
  return JSON.parse(await readText(path.join(runDir(runId), 'failures.json'))) as Failure[]
}

async function readSummary(runId: string): Promise<RunSummary> {
  return JSON.parse(await readText(path.join(runDir(runId), 'summary.json'))) as RunSummary
}

// ── the loop ───────────────────────────────────────────────────────────────────────────────

type Next = 'continue' | 'end'

const EXPECTED_ERRORS = new Set([
  'StopLoop',
  'RequestError',
  'TaskGraphError',
  'GhError',
  'SettingsError'
])

// Returns the process exit code: 0 when the run (or the dry run) finished, 1 when it stopped.
export async function runLoop(options: LoopOptions, deps: LoopDeps): Promise<number> {
  const loop = new Loop(options, deps)
  try {
    await loop.start()
    return 0
  } catch (error) {
    if (!(error instanceof Error) || !EXPECTED_ERRORS.has(error.name)) throw error
    deps.log(`\n✘ ${error.message}`)
    if (error instanceof StopLoop) for (const detail of error.details) deps.log(`    ${detail}`)
    await loop.persist()
    const resumable = loop.current && STAGE_IDS.indexOf(loop.current) > STAGE_IDS.indexOf('intake')
    if (resumable && !options.dryRun)
      deps.log(`\n  Resume with: npm run loop -- --from-stage ${loop.current}`)
    return 1
  }
}

class Loop {
  current: StageId | undefined
  private state: LoopState | undefined
  private requestIssue: number | null = null
  private cache: { request?: TestRequest; graph?: TaskGraph } = {}
  private source: LoopSource

  constructor(
    private readonly options: LoopOptions,
    private readonly deps: LoopDeps
  ) {
    this.source = options.source
  }

  private get dryRun(): boolean {
    return this.options.dryRun
  }

  private log(line: string): void {
    this.deps.log(line)
  }

  private dry(line: string): void {
    this.log(`  [dry-run] ${line}`)
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date()
  }

  async start(): Promise<void> {
    const { fromStage } = this.options
    this.log(
      this.dryRun
        ? 'Dev loop, dry run: every stage, gate and write is printed. No agent, git write or gh write runs.'
        : 'Dev loop'
    )
    if (fromStage) await this.resume(fromStage)
    if (this.source.kind === 'next') this.source = await this.resolveNext()
    const first: StageId = fromStage ?? (this.source.kind === 'prompt' ? 'request' : 'intake')
    const firstIndex = STAGE_IDS.indexOf(first)
    for (const id of STAGE_IDS.slice(0, firstIndex)) {
      printSkipped(
        id,
        fromStage ? `resuming at ${fromStage}` : 'the request already exists (no --prompt)',
        line => this.log(line)
      )
    }
    for (const id of STAGE_IDS.slice(firstIndex)) {
      this.current = id
      printBox(id, line => this.log(line))
      const next = await this.runStage(id)
      if (this.state) this.state.completed = [...new Set([...this.state.completed, id])]
      await this.persist()
      if (next === 'end') return
    }
    this.log(
      this.dryRun
        ? '\n✔ Dry run complete: every stage printed, nothing changed.'
        : '\n✔ Run complete.'
    )
  }

  // --next: the first unchecked request line. With an issue it is an issue run; without one,
  // the orchestrator drafts the request from the line and Gate 0 links the issue to it.
  private async resolveNext(): Promise<LoopSource> {
    const item = nextBacklogItem(await readText(FILE.backlog))
    if (!item) throw new StopLoop('The backlog has no unchecked request line in its current queue.')
    this.log(
      `Next backlog line (.plan/000-backlog.md:${item.line}): "${item.title}"` +
        (item.issue ? ` → #${item.issue}` : ', no request issue yet: the orchestrator drafts one')
    )
    return item.issue
      ? { kind: 'issue', issue: item.issue }
      : { kind: 'prompt', prompt: item.title, backlogLine: item.line }
  }

  private runStage(id: StageId): Promise<Next> {
    switch (id) {
      case 'request':
        return this.stageRequest()
      case 'gate-0':
        return this.stageGate0()
      case 'intake':
        return this.stageIntake()
      case 'scope':
        return this.stageScope()
      case 'plan-tests':
        return this.stagePlanTests()
      case 'gate-a':
        return this.stageGateA()
      case 'framework':
        return this.stageFramework()
      case 'implement':
        return this.stageImplement()
      case 'gate':
        return this.stageGate()
      case 'review':
        return this.stageReview()
      case 'run':
        return this.stageRun()
      case 'classify':
        return this.stageClassify()
      case 'gate-b':
        return this.stageGateB()
      case 'bugs':
        return this.stageBugs()
      case 'gate-c':
        return this.stageGateC()
      case 'deliver':
        return this.stageDeliver()
    }
  }

  // ── state ────────────────────────────────────────────────────────────────────────────────

  async persist(): Promise<void> {
    if (this.state && !this.dryRun) await writeState(this.state)
  }

  private async resume(fromStage: StageId): Promise<void> {
    // Intake creates the state; a stage up to it needs none.
    if (STAGE_IDS.indexOf(fromStage) <= STAGE_IDS.indexOf('intake')) return
    const state = await loadState()
    if (!state) {
      if (this.dryRun) return
      throw new StopLoop(
        'Nothing to resume: .orchestrate/loop-state.json does not exist. Start the run from intake.'
      )
    }
    const branch = currentBranch()
    if (!this.dryRun && branch !== state.branch) {
      throw new StopLoop(
        `The run lives on ${state.branch}, but the current branch is ${branch}. Switch to it first.`
      )
    }
    this.state = state
    this.requestIssue = state.requestIssue
  }

  private requireState(): LoopState {
    if (!this.state) throw new StopLoop('No loop state: start the run from intake.')
    return this.state
  }

  private approve(gate: 'A' | 'B' | 'C'): void {
    if (this.state) this.state.approvals[gate] = this.now().toISOString()
  }

  private async loadRequest(): Promise<TestRequest> {
    this.cache.request ??= RequestSchema.parse(JSON.parse(await readText(FILE.request)))
    return this.cache.request
  }

  private async loadGraph(request: TestRequest): Promise<TaskGraph> {
    if (!this.cache.graph) {
      const file = this.dryRun ? path.join(REPO_ROOT, SAMPLE_TASK_GRAPH) : FILE.taskGraph
      this.cache.graph = validateTaskGraph(JSON.parse(await readText(file)), request)
    }
    return this.cache.graph
  }

  private async readAreaPlans(area: string): Promise<{
    plan: TestPlan
    execution: ExecutionPlan | Error
    planFile: string
    executionFile: string
  }> {
    const planFile = `.test/${area}/test-plan.md`
    const executionFile = `.test/${area}/execution-plan.md`
    const planPath = path.join(REPO_ROOT, planFile)
    const plan = (await exists(planPath))
      ? parseTestPlan(await readText(planPath), area, planFile)
      : { area, file: planFile, requirements: [], cases: [], errors: [`${planFile}: missing`] }
    let execution: ExecutionPlan | Error
    try {
      execution = parseExecutionPlan(
        await readText(path.join(REPO_ROOT, executionFile)),
        executionFile
      )
    } catch (error) {
      execution = error instanceof Error ? error : new Error(String(error))
    }
    return { plan, execution, planFile, executionFile }
  }

  private async executionPlan(area: string): Promise<ExecutionPlan> {
    const { execution } = await this.readAreaPlans(area)
    if (execution instanceof Error) throw new StopLoop(execution.message)
    return execution
  }

  private async loadDrafts(): Promise<Draft[]> {
    return readIfExists(FILE.drafts, z.array(DraftSchema), [])
  }

  private async loadFindings(): Promise<ReviewFinding[]> {
    return readIfExists(FILE.findings, z.array(FindingSchema), [])
  }

  // ── side effects ─────────────────────────────────────────────────────────────────────────

  // Agent calls, one or in parallel, then the lane check: the hook blocked every write it
  // could see; comparing the tree before and after catches the rest (Bash included).
  private async runAgents<T extends { status: 'done' | 'blocked'; summary: string }>(
    stage: StageId,
    caps: Caps,
    output: z.ZodType<T>,
    calls: { role: AgentRole; prompt: string }[]
  ): Promise<{ role: AgentRole; output: T }[]> {
    const before = snapshotTree()
    const outcomes = await Promise.all(
      calls.map(async call => ({
        role: call.role,
        outcome: await this.deps.agents.run({
          stage,
          role: call.role,
          prompt: call.prompt,
          output,
          ...caps
        })
      }))
    )
    const roles = calls.map(call => call.role)
    const changed = changedSince(before, snapshotTree())
    const outside = changed.filter(file =>
      roles.every(role => laneViolations(role, [file]).length > 0)
    )
    if (outside.length) {
      throw new StopLoop(
        `${roles.join(' ∥ ')} changed files outside ${roles.length > 1 ? 'their lanes' : 'its lane'}. Review and revert them by hand.`,
        roles.length === 1 ? roles.flatMap(role => laneViolations(role, outside)) : outside
      )
    }
    if (changed.length)
      this.log(
        `  ↳ ${changed.length} file(s) changed, all inside ${roles.length > 1 ? 'their lanes' : 'the lane'}`
      )

    return outcomes.map(({ role, outcome }) => {
      if (!outcome.ok) throw new StopLoop(outcome.error)
      if (outcome.output.status === 'blocked')
        throw new StopLoop(`${role} is blocked: ${outcome.output.summary}`)
      this.log(`  ↳ ${role}: ${outcome.output.summary}`)
      return { role, output: outcome.output }
    })
  }

  // The gate as its own process: the same command the owner runs, and its exit code is the
  // verdict. Returns what it wrote to .orchestrate/gate.json.
  private async runGate(checks?: readonly CheckId[]): Promise<GateResult> {
    const started = new Date().toISOString()
    const only = checks ? ['--only', checks.join(',')] : []
    this.log(`  $ npm run gate${only.length ? ` -- ${only.join(' ')}` : ''}`)
    const status = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, NODE_BIN.tsx), 'tools/gates/index.ts', ...only],
      {
        cwd: REPO_ROOT,
        stdio: 'inherit'
      }
    ).status
    const result = await this.readGate()
    if (result.startedAt < started)
      throw new StopLoop(
        'The gate did not write .orchestrate/gate.json: run npm run gate to see why.'
      )
    if ((status === 0) !== result.ok)
      throw new StopLoop(`The gate exited with ${status} but gate.json says ok=${result.ok}.`)
    return result
  }

  private readGate(): Promise<GateResult> {
    return readJson(FILE.gate, GateFileSchema)
  }

  private gitWrite(args: string[]): void {
    if (this.dryRun) {
      this.dry(`git ${args.map(arg => (/[\s"]/.test(arg) ? JSON.stringify(arg) : arg)).join(' ')}`)
      return
    }
    const result = git(args)
    if (result.code !== 0)
      throw new StopLoop(`git ${args[0] ?? ''} failed`, tail(result.stderr || result.stdout))
  }

  private ensureLabels(labels: Label[]): void {
    for (const label of labels)
      this.deps.github.ensureLabel(label.name, label.color, label.description)
  }

  private async commentOnRequest(name: string, body: string): Promise<void> {
    if (!this.requestIssue) {
      this.log(`  ↳ local request: no request issue to comment on (${name})`)
      return
    }
    const file = path.join(FILE.comments, `${name}.md`)
    await writeText(file, redact(body))
    this.deps.github.commentOnIssue(this.requestIssue, rel(file))
  }

  // ── 0 request (--prompt only) ────────────────────────────────────────────────────────────

  private async stageRequest(): Promise<Next> {
    const { source } = this
    if (source.kind !== 'prompt')
      throw new StopLoop('Stage 0 drafts a request from a prompt: pass --prompt "<what to test>".')
    const prompt = requestDraftPrompt(source.prompt)
    if (this.dryRun) {
      this.dry(`run the orchestrator agent: ${firstLine(prompt)}`)
      this.dry(`prompt: "${source.prompt}" → .orchestrate/request-draft.md`)
      return 'continue'
    }
    await this.runAgents('request', CAPS.request, RequestDraftOutput, [
      { role: 'orchestrator', prompt }
    ])
    const draft = parseTestRequest(await readText(FILE.draft), { allowInferred: true })
    const inferred = draft.acceptanceCriteria.filter(criterion => criterion.inferred).length
    this.log(
      `  ↳ the draft parses: "${draft.title}", area ${draft.area}, ${draft.acceptanceCriteria.length} criteria (${inferred} ${INFERRED_MARK})`
    )
    return 'continue'
  }

  // ── ✋ Gate 0 ────────────────────────────────────────────────────────────────────────────

  private async stageGate0(): Promise<Next> {
    const backlogLine = this.source.kind === 'prompt' ? this.source.backlogLine : undefined
    const details = [
      'Draft: .orchestrate/request-draft.md. Edit it as you like.',
      `Confirm each criterion marked ${INFERRED_MARK} by deleting the mark, or delete the criterion.`,
      `On approval the driver files it as the request issue and ${backlogLine ? `links it from backlog line ${backlogLine}` : 'adds its backlog line'}.`
    ]
    if (this.dryRun) {
      await ownerGate(this.deps.io, { gate: '0', title: 'the request draft', details }, true)
      const area = LABEL.area('<area>')
      this.ensureLabels([LABEL.testRequest, area])
      this.deps.github.createIssue({
        title: '<draft title>',
        bodyFile: '.orchestrate/comments/request-issue.md',
        labels: [LABEL.testRequest.name, area.name]
      })
      this.dry(
        backlogLine
          ? `append " | issue:#<n>" to .plan/000-backlog.md:${backlogLine}, then continue as --issue <n>`
          : 'add "- [ ] <area>: <draft title> | issue:#<n>" to .plan/000-backlog.md, then continue as --issue <n>'
      )
      this.log(
        '\nA prompt dry run ends at Gate 0: no agent ran, so there is no draft to take further.'
      )
      this.log('`npm run loop -- --request-file <file> --dry-run` prints the stages after it.')
      return 'end'
    }

    const request = await this.approvedDraft(details)
    const bodyFile = path.join(FILE.comments, 'request-issue.md')
    await writeText(bodyFile, (await readText(FILE.draft)).replace(/^#\s+.+\r?\n+/m, ''))
    this.ensureLabels([LABEL.testRequest, LABEL.area(request.area)])
    const created = this.deps.github.createIssue({
      title: request.title,
      bodyFile: rel(bodyFile),
      labels: [LABEL.testRequest.name, LABEL.area(request.area).name]
    })
    this.log(`  ↳ filed the request issue #${created.number}: ${created.url}`)
    const backlog = await readText(FILE.backlog)
    if (backlogLine) {
      await writeText(FILE.backlog, linkBacklogLine(backlog, backlogLine, created.number))
      this.log(`  ↳ linked it from .plan/000-backlog.md:${backlogLine}`)
    } else {
      const line = `${request.area}: ${titleWithoutArea(request.area, request.title)}`
      await writeText(FILE.backlog, addBacklogLine(backlog, line, created.number))
      this.log('  ↳ added its line to .plan/000-backlog.md')
    }
    this.requestIssue = created.number
    return 'continue'
  }

  // Asks until the owner rejects or the draft parses with no inferred criterion left.
  private async approvedDraft(details: string[]): Promise<TestRequest> {
    for (;;) {
      const answer = await ownerGate(
        this.deps.io,
        { gate: '0', title: 'the request draft', details },
        false
      )
      if (answer === 'reject')
        throw new StopLoop('The owner rejected the request draft at Gate 0. Nothing was filed.')
      try {
        return parseTestRequest(await readText(FILE.draft), { allowInferred: false })
      } catch (error) {
        if (!(error instanceof RequestError)) throw error
        this.log(`  ✘ ${error.message}`)
      }
    }
  }

  // ── intake + preflight ───────────────────────────────────────────────────────────────────

  private async stageIntake(): Promise<Next> {
    const request = await this.intakeRequest()
    await writeJson(FILE.request, request)
    this.cache = { request }
    this.requestIssue = request.issue
    this.log(
      `  ↳ .orchestrate/request.json is valid: "${request.title}" (${request.issue ? `#${request.issue}` : 'local request'}), ` +
        `area ${request.area}, ${request.acceptanceCriteria.length} criteria, roles ${request.roles.join(', ')}`
    )
    await this.preflight(request)
    const branch = `test/${request.area}`
    if (currentBranch() !== branch) this.gitWrite(['switch', '-c', branch])
    this.state = {
      version: 1,
      requestIssue: request.issue,
      area: request.area,
      branch,
      completed: [],
      reviewRounds: 0,
      repairRounds: 0,
      approvals: {},
      updatedAt: this.now().toISOString()
    }
    return 'continue'
  }

  private async intakeRequest(): Promise<TestRequest> {
    // Filed at Gate 0 by this run.
    if (this.requestIssue) return this.requestFromIssue(this.requestIssue)
    const { source } = this
    switch (source.kind) {
      case 'file':
        return parseTestRequest(await readText(path.resolve(REPO_ROOT, source.file)), {
          allowInferred: false
        })
      case 'resume':
        return this.loadRequest()
      case 'issue':
        return this.requestFromIssue(source.issue)
      case 'next':
      case 'prompt':
        // start() resolves --next; a prompt run gets here only through Gate 0's issue.
        throw new StopLoop(`A ${source.kind} run reaches intake only with a request issue.`)
    }
  }

  private requestFromIssue(number: number): TestRequest {
    const issue = this.deps.github.viewIssue(number)
    if (issue.state.toUpperCase() !== 'OPEN')
      throw new StopLoop(`Request issue #${number} is ${issue.state.toLowerCase()}.`)
    if (!issue.labels.some(label => label.name === LABEL.testRequest.name)) {
      this.log(`  ⚠ #${number} has no ${LABEL.testRequest.name} label`)
    }
    return parseTestRequest(issue.body, {
      issue: number,
      url: issue.url,
      title: issue.title,
      allowInferred: false
    })
  }

  // Before any agent spends money: the tree, the branch, GitHub, the settings, the dev host,
  // and a fresh login for every QA user with a phone set.
  private async preflight(request: TestRequest): Promise<void> {
    const problems: string[] = []
    const check = (name: string, problem?: string) => {
      this.log(`  ${problem ? '✘' : '✔'} ${name}${problem ? `: ${problem}` : ''}`)
      if (problem) problems.push(`${name}: ${problem}`)
    }

    let baseUrl: string | undefined
    try {
      const settings = loadSettings()
      // Only the QA users the request involves must be set up: the employee may never be.
      const roles = ROLES.filter(role => request.roles.includes(role))
      for (const role of roles) requirePhone(settings, role)
      baseUrl = settings.baseUrl
      check(
        `settings valid, ${new URL(settings.baseUrl).hostname} is allowlisted, ` +
          `QA phone set for ${roles.join(', ') || 'no QA user'}`
      )
    } catch (error) {
      check('settings', errorMessage(error).replace(/\s*\n\s*/g, ' '))
    }

    // The backlog line a prompt run added at Gate 0 is the driver's own change.
    const allowed = this.source.kind === 'prompt' ? ['.plan/000-backlog.md'] : []
    const dirty = git(['status', '--porcelain'])
      .stdout.split(/\r?\n/)
      .filter(Boolean)
      .map(line => line.slice(3))
      .filter(file => !allowed.includes(file))
    check(
      'clean working tree',
      dirty.length
        ? `${dirty.length} uncommitted change(s), e.g. ${dirty.slice(0, 3).join(', ')}`
        : undefined
    )

    const branch = currentBranch()
    const target = `test/${request.area}`
    check(
      `on main (or ${target})`,
      branch === 'main' || branch === target ? undefined : `on ${branch || 'no branch'}`
    )
    if (
      branch !== target &&
      git(['rev-parse', '--verify', '--quiet', `refs/heads/${target}`]).code === 0
    ) {
      check(`branch ${target} is free`, 'it already exists: finish or delete that run first')
    }

    if (this.dryRun) {
      this.dry('gh auth status --json hosts (the GitHub account the driver files as)')
      this.dry(`GET ${baseUrl ?? DEFAULT_BASE_URL}/login (the dev health check)`)
      this.dry(
        `${profileSteps('setup').map(commandLine).join(' && ')} (fresh .auth/: every QA user with a phone set logs in)`
      )
      if (problems.length)
        this.dry(`a real run would stop here: ${problems.length} preflight problem(s)`)
      return
    }

    let login: string | undefined
    let ghProblem: string | undefined
    try {
      login = this.deps.github.authenticatedLogin()
      if (!login) ghProblem = 'not logged in: run gh auth login'
    } catch (error) {
      ghProblem = errorMessage(error)
    }
    check(`gh auth status${login ? ` (${login})` : ''}`, ghProblem)
    if (baseUrl) {
      const health = await healthCheck(baseUrl)
      check('dev health check', health.healthy ? undefined : health.detail)
    }
    if (problems.length) throw new StopLoop('Preflight failed.', problems)

    const runId = createRunId(this.now())
    for (const step of profileSteps('setup')) {
      this.log(`  $ ${commandLine(step)}`)
      check(
        'fresh .auth/ (the setup project)',
        runStep(step, runId) === 0 ? undefined : 'the setup project failed, see its output above'
      )
    }
    if (problems.length) throw new StopLoop('Preflight failed.', problems)
  }

  // ── 1 scope ──────────────────────────────────────────────────────────────────────────────

  private async stageScope(): Promise<Next> {
    const request = await this.loadRequest()
    const number = nextPlanNumber(await readdir(path.join(REPO_ROOT, '.plan')))
    const today = isoDate(this.now())
    if (this.dryRun) {
      this.dry(`run the orchestrator agent: ${firstLine(scopePrompt(request, number, today))}`)
      this.dry(`→ .plan/${number}-${today}-<topic>.md and .orchestrate/task-graph.json`)
      const graph = await this.loadGraph(request)
      this.log(`  ↳ the sample task graph ${SAMPLE_TASK_GRAPH} is valid: ${describeGraph(graph)}`)
      return 'continue'
    }
    let problems: string[] = []
    for (let attempt = 0; ; attempt++) {
      await this.runAgents('scope', CAPS.scope, ScopeOutput, [
        { role: 'orchestrator', prompt: scopePrompt(request, number, today, problems) }
      ])
      problems = await this.scopeProblems(request, number)
      if (!problems.length) break
      this.rejected(problems, attempt, 'the task graph')
    }
    const graph = await this.loadGraph(request)
    this.log(`  ↳ ${graph.plan}; the task graph is valid: ${describeGraph(graph)}`)
    return 'continue'
  }

  private async scopeProblems(request: TestRequest, number: string): Promise<string[]> {
    this.cache.graph = undefined
    let graph: TaskGraph
    try {
      graph = validateTaskGraph(JSON.parse(await readText(FILE.taskGraph)), request)
    } catch (error) {
      return error instanceof TaskGraphError ? error.problems : [errorMessage(error)]
    }
    const problems: string[] = []
    if (!graph.plan.startsWith(`.plan/${number}-`))
      problems.push(`the plan must be .plan/${number}-<date>-<topic>.md, not ${graph.plan}`)
    if (!(await exists(path.join(REPO_ROOT, graph.plan))))
      problems.push(`${graph.plan} does not exist`)
    const others = areasOf(graph).filter(area => area !== request.area)
    if (others.length) {
      problems.push(
        `criteria are assigned to ${others.join(', ')}: one run covers the request's area (${request.area}) only`
      )
    }
    return problems
  }

  // A rejected hand-off goes back to the same agent, at most MAX_RETRIES times.
  private rejected(problems: string[], attempt: number, what: string): void {
    if (attempt >= MAX_RETRIES)
      throw new StopLoop(
        `${what} is still rejected after ${MAX_RETRIES} retries: over to the owner.`,
        problems
      )
    this.log(`  ✘ ${what} is rejected (retry ${attempt + 1} of ${MAX_RETRIES}):`)
    for (const problem of problems) this.log(`    - ${problem}`)
  }

  // ── 2 plan tests ─────────────────────────────────────────────────────────────────────────

  private async stagePlanTests(): Promise<Next> {
    const request = await this.loadRequest()
    const graph = await this.loadGraph(request)
    if (this.dryRun) {
      this.dry(`run the test-planner agent: ${firstLine(testPlanPrompt(request, graph))}`)
      await this.describeAreaPlans(request)
      return 'continue'
    }
    let problems: string[] = []
    for (let attempt = 0; ; attempt++) {
      const [result] = await this.runAgents('plan-tests', CAPS.planTests, TestPlanOutput, [
        { role: 'test-planner', prompt: testPlanPrompt(request, graph, problems) }
      ])
      if (result) await writeJson(FILE.testPlanSummary, result.output)
      const { plan, execution } = await this.readAreaPlans(request.area)
      problems = testPlanProblems(request, plan, execution)
      if (!problems.length) break
      this.rejected(problems, attempt, 'the test plan')
    }
    await this.describeAreaPlans(request)
    return 'continue'
  }

  private async describeAreaPlans(request: TestRequest): Promise<void> {
    const { plan, execution, planFile, executionFile } = await this.readAreaPlans(request.area)
    this.log(
      `  ↳ ${planFile}: ${plan.requirements.length} requirements, ${plan.cases.length} cases` +
        (plan.errors.length ? `, ${plan.errors.length} parse error(s)` : ', parses')
    )
    if (execution instanceof Error) this.log(`  ✘ ${execution.message}`)
    else {
      this.log(
        `  ↳ ${executionFile} front matter: grep ${execution.grep}, newCaseRepeat ${execution.newCaseRepeat}, ` +
          `serial ${execution.serial}, exit P1 ${execution.exit.p1PassRate}% / overall ${execution.exit.overallPassRate}% / ` +
          `new flaky ≤${execution.exit.maxNewFlaky} / untriaged ${execution.exit.untriagedFailures}`
      )
    }
    if (this.dryRun) {
      const open = testPlanProblems(request, plan, execution)
      if (open.length) {
        this.dry(`left for the test planner in a real run (${open.length}):`)
        for (const problem of open) this.log(`      - ${problem}`)
      }
    }
  }

  // ── ✋ Gate A ────────────────────────────────────────────────────────────────────────────

  private async stageGateA(): Promise<Next> {
    const request = await this.loadRequest()
    const graph = await this.loadGraph(request)
    const { plan, planFile, executionFile } = await this.readAreaPlans(request.area)
    const summary = this.dryRun
      ? undefined
      : await readIfExists(FILE.testPlanSummary, TestPlanOutput, undefined)
    const deferred = deferredCriteria(request, plan)
    const details = [
      `Implementation plan: ${graph.plan}`,
      `Test plan: ${planFile} (${plan.requirements.length} requirements, ${plan.cases.length} cases)`,
      `Execution plan: ${executionFile}`,
      ...(deferred.length
        ? ['Deferred criteria:', ...deferred.map(line => `  ${line}`)]
        : ['Deferred criteria: none']),
      ...(summary?.ambiguities.length
        ? ['Ambiguities the test planner found:', ...summary.ambiguities.map(item => `  - ${item}`)]
        : [])
    ]
    const answer = await ownerGate(
      this.deps.io,
      { gate: 'A', title: 'the plan, the test plan, the execution plan and any deferral', details },
      this.dryRun
    )
    if (answer === 'reject') {
      throw new StopLoop(
        'The owner rejected the plans at Gate A. Edit them (or the request), then resume with --from-stage plan-tests.'
      )
    }
    const files = [graph.plan, planFile, executionFile]
    if (this.dryRun) this.dry(`set "Status: active" in ${files.join(', ')}`)
    else {
      for (const file of files) {
        const full = path.join(REPO_ROOT, file)
        await writeText(full, activateStatus(await readText(full)))
      }
      this.approve('A')
    }
    await this.commentOnRequest(
      'gate-a',
      [
        'Gate A approved: the plans for this request are active.',
        '',
        ...files.map(file => `- \`${file}\` on branch \`test/${request.area}\``)
      ].join('\n')
    )
    return 'continue'
  }

  // ── 3 framework ──────────────────────────────────────────────────────────────────────────

  private async stageFramework(): Promise<Next> {
    const request = await this.loadRequest()
    const graph = await this.loadGraph(request)
    if (!graph.frameworkNeeded) {
      this.log('  ↳ skipped: the task graph has no framework-architect task')
      return 'continue'
    }
    if (this.dryRun) {
      this.dry(`run the framework-architect agent: ${firstLine(frameworkPrompt(request, graph))}`)
      this.dry(`npm run gate -- --only ${FRAMEWORK_SUBSET.join(',')}`)
      return 'continue'
    }
    await this.frameworkRound(request, graph, [])
    return 'continue'
  }

  private async frameworkRound(
    request: TestRequest,
    graph: TaskGraph,
    requests: string[]
  ): Promise<void> {
    let gateFailures: string[] = []
    for (let attempt = 0; ; attempt++) {
      await this.runAgents('framework', CAPS.framework, FrameworkOutput, [
        {
          role: 'framework-architect',
          prompt: frameworkPrompt(request, graph, { requests, gateFailures })
        }
      ])
      const gate = await this.runGate(FRAMEWORK_SUBSET)
      if (gate.ok) return
      gateFailures = gateFailureLines(gate)
      this.rejected(gateFailures, attempt, 'the framework change')
    }
  }

  // ── 4 implement ──────────────────────────────────────────────────────────────────────────

  private async stageImplement(): Promise<Next> {
    const request = await this.loadRequest()
    const graph = await this.loadGraph(request)
    const lanes = LANES.filter(lane =>
      graph.tasks.some(task => task.agent === `test-developer-${lane}`)
    )
    if (this.dryRun) {
      this.dry(
        `run ${lanes.map(lane => `test-developer-${lane}`).join(' ∥ ')} in parallel, disjoint lanes`
      )
      for (const lane of lanes)
        this.dry(`test-developer-${lane}: ${firstLine(developerPrompt(lane, request, graph))}`)
      this.dry(
        `a framework request goes to the framework-architect, then back to the developer who asked (≤${MAX_RETRIES})`
      )
      return 'continue'
    }
    let active: readonly ('ui' | 'api')[] = lanes
    let notes: string[] = []
    for (let round = 0; ; round++) {
      const results = await this.runAgents(
        'implement',
        CAPS.implement,
        DeveloperOutput,
        active.map(lane => ({
          role: `test-developer-${lane}` as const,
          prompt: developerPrompt(lane, request, graph, notes)
        }))
      )
      const asks = results.flatMap(({ role, output }) =>
        output.frameworkRequests.map(item => ({
          role,
          line: `${role}: ${item.need} (${item.why})`
        }))
      )
      if (!asks.length) return 'continue'
      if (round >= MAX_RETRIES) {
        throw new StopLoop(
          `Framework requests are still open after ${MAX_RETRIES} rounds: over to the owner.`,
          asks.map(ask => ask.line)
        )
      }
      this.log(`  ↳ ${asks.length} framework request(s): to the framework-architect`)
      await this.frameworkRound(
        request,
        graph,
        asks.map(ask => ask.line)
      )
      active = lanes.filter(lane => asks.some(ask => ask.role === `test-developer-${lane}`))
      notes = [
        'The framework-architect answered your framework requests: read .orchestrate/framework-architect-report.md,',
        'then implement the cases you left open.'
      ]
    }
  }

  // ── 5 gate ───────────────────────────────────────────────────────────────────────────────

  private async stageGate(): Promise<Next> {
    if (this.dryRun) {
      this.dry('npm run gate → .orchestrate/gate.json and .orchestrate/coverage-report.md')
      return 'continue'
    }
    const gate = await this.runGate()
    this.log(
      gate.ok
        ? '  ↳ the gate passed'
        : '  ↳ the gate failed: the review stage sends each failure to the agent that owns it'
    )
    return 'continue'
  }

  // ── 6 review ─────────────────────────────────────────────────────────────────────────────

  private async stageReview(): Promise<Next> {
    const request = await this.loadRequest()
    const graph = await this.loadGraph(request)
    if (this.dryRun) {
      this.dry(`run the code-reviewer agent: ${firstLine(reviewPrompt(request, graph, 1))}`)
      this.dry(
        `findings and gate failures → the owning agent → gate → review again (≤${MAX_RETRIES} repair rounds), then the owner`
      )
      return 'continue'
    }
    const state = this.requireState()
    const findings = await this.loadFindings()
    for (let round = 1; ; round++) {
      state.reviewRounds = round
      await this.persist()
      const [review] = await this.runAgents('review', CAPS.review, ReviewOutput, [
        { role: 'code-reviewer', prompt: reviewPrompt(request, graph, round) }
      ])
      const raised = review?.output.findings ?? []
      for (const finding of raised) {
        const resolution = finding.severity === 'nit' ? 'noted' : 'open'
        const existing = findings.find(candidate => candidate.id === finding.id)
        if (existing) existing.resolution = resolution
        else {
          findings.push({
            id: finding.id,
            severity: finding.severity,
            owner: finding.owner,
            file: finding.line ? `${finding.file}:${finding.line}` : finding.file,
            message: finding.message,
            resolution
          })
        }
      }
      await writeJson(FILE.findings, findings)

      const gate = await this.readGate()
      const blockers = raised.filter(finding => finding.severity === 'blocker')
      this.log(
        `  ↳ round ${round}: ${raised.length} finding(s), ${blockers.length} blocker(s), gate ${gate.ok ? 'green' : 'red'}`
      )
      if (gate.ok && !blockers.length) return 'continue'

      // Blockers and should-fix findings go to their owner, gate failures to the lane that holds
      // the file. A should-fix alone never costs a round: it stays open for Gate C.
      const routed = routeGateFailures(gate)
      for (const finding of raised.filter(candidate => candidate.severity !== 'nit')) {
        addRouted(
          routed,
          finding.owner,
          `${finding.id} (${finding.severity}) ${finding.file}${finding.line ? `:${finding.line}` : ''}: ${finding.message}`
        )
      }
      if (routed.owner.length) {
        throw new StopLoop(
          'Gate failures that no agent owns: fix them, then resume with --from-stage gate.',
          routed.owner
        )
      }
      if (round > MAX_RETRIES) {
        throw new StopLoop(
          `Still open after ${MAX_RETRIES} repair rounds: over to the owner. Fix them, then resume with --from-stage gate.`,
          [...routed.byRole.values()].flat()
        )
      }
      for (const { output } of await this.repair('review', request, routed)) {
        for (const id of output.resolved) {
          const finding = findings.find(candidate => candidate.id === id)
          if (finding) finding.resolution = `fixed in repair round ${round}`
        }
      }
      await writeJson(FILE.findings, findings)
      printBox('gate', line => this.log(line))
      await this.runGate()
    }
  }

  // One repair call per owning agent, framework first: the developers build on it.
  private async repair(
    stage: StageId,
    request: TestRequest,
    routed: Routed
  ): Promise<{ output: z.infer<typeof RepairOutput> }[]> {
    const results: { output: z.infer<typeof RepairOutput> }[] = []
    for (const role of REPAIR_ROLES) {
      const items = routed.byRole.get(role)
      if (!items?.length) continue
      results.push(
        ...(await this.runAgents(stage, CAPS.repair, RepairOutput, [
          { role, prompt: repairPrompt(role, request, items) }
        ]))
      )
    }
    return results
  }

  // ── 7 run ────────────────────────────────────────────────────────────────────────────────

  private async stageRun(): Promise<Next> {
    const request = await this.loadRequest()
    const steps = this.areaRunSteps(await this.executionPlan(request.area))
    if (this.dryRun) {
      this.dry(`GET ${DEFAULT_BASE_URL}/login (health check), then one run id for these steps:`)
      for (const step of steps) this.dry(commandLine(step))
      return 'continue'
    }
    await this.executeRun(steps)
    return 'continue'
  }

  private areaRunSteps(execution: ExecutionPlan): RunStep[] {
    return [
      ...profileSteps('setup'),
      ...profileSteps('smoke'),
      ...profileSteps('area', { plan: execution, newSpecFiles: changedSpecFiles() })
    ]
  }

  // Health check, the steps, health check again; then summary.json and failures.json.
  private async executeRun(
    steps: RunStep[]
  ): Promise<{ runId: string; summary: RunSummary; failures: Failure[] }> {
    const { baseUrl } = loadSettings()
    const before = await healthCheck(baseUrl)
    if (!before.healthy)
      throw new StopLoop(
        `The dev host is not healthy: ${before.detail}. Resume with --from-stage run once it is.`
      )
    const runId = createRunId(this.now())
    this.requireState().runId = runId
    await this.persist()
    this.log(`  ↳ run ${runId} → .orchestrate/runs/${runId}/`)
    for (const step of steps) {
      this.log(`  $ ${commandLine(step)}`)
      const code = runStep(step, runId)
      if (step.step === 'setup' && code !== 0) {
        throw new StopLoop(
          'The setup project failed, so there is no session to test with. Check the QA users and their passkeys.'
        )
      }
      if (step.step.startsWith('smoke') && code !== 0) {
        this.log('  ✘ smoke failed: the entry criteria are not met, so the area steps are skipped')
        break
      }
    }
    const after = await healthCheck(baseUrl)
    const { summary, failures } = await summarizeRun(runId, after.healthy)
    const counts = countByClass(failures)
    this.log(
      `  ↳ ${summary.steps.map(step => `${step.step}: ${step.results}`).join(', ')} result(s). ` +
        `Failing cases: ${failures.length} (env ${counts.env}, flaky ${counts.flaky}, untriaged ${counts.untriaged})`
    )
    return { runId, summary, failures }
  }

  // ── 8 classify + triage ──────────────────────────────────────────────────────────────────

  private async stageClassify(): Promise<Next> {
    if (this.dryRun) {
      this.dry(
        'rules: env = failed health check, 5xx, challenge page or connection error; flaky = passed and failed across repeats; the rest is untriaged'
      )
      this.dry(
        'owner triage (phase 1): each untriaged failure is a test bug or a product bug; each flaky one a test bug or a quarantine proposal'
      )
      this.dry(
        `test bug → its agent (≤${MAX_RETRIES}; an edited assertion fails the gate) → gate → stage 7. env → one rerun`
      )
      this.dry(
        'product bug or quarantine proposal → .orchestrate/bugs/<case-id>.md from .github/ISSUE_TEMPLATE/bug-report.md'
      )
      return 'continue'
    }
    const request = await this.loadRequest()
    const state = this.requireState()
    let envReruns = 0
    for (let round = 0; ;) {
      if (!state.runId) throw new StopLoop('No test run to classify: resume with --from-stage run.')
      const failures = await readFailures(state.runId)
      if (!failures.length) {
        this.log('  ↳ no failing case')
        await writeJson(FILE.drafts, [])
        return 'continue'
      }
      const env = failures.filter(failure => failure.class === 'env')
      if (env.length) {
        if (envReruns >= 1) {
          throw new StopLoop(
            'Environment failures again after one rerun: the dev host is not usable now. Resume with --from-stage run later.',
            env.map(describeFailure)
          )
        }
        envReruns++
        this.log(`  ↳ ${env.length} environment failure(s): one rerun after a health check`)
        printBox('run', line => this.log(line))
        await this.executeRun(this.areaRunSteps(await this.executionPlan(request.area)))
        continue
      }

      await this.triage(failures)
      await writeJson(path.join(runDir(state.runId), 'failures.json'), failures)
      const testBugs = failures.filter(failure => failure.class === 'test-bug')
      if (!testBugs.length) {
        await this.writeBugDrafts(
          request,
          failures.filter(failure => failure.class === 'product-bug' || failure.class === 'flaky'),
          state.runId
        )
        return 'continue'
      }

      if (round >= MAX_RETRIES) {
        throw new StopLoop(
          `Test bugs remain after ${MAX_RETRIES} repair rounds: over to the owner.`,
          testBugs.map(describeFailure)
        )
      }
      round++
      state.repairRounds = round
      const routed = emptyRouting()
      for (const failure of testBugs)
        addRouted(routed, ownerOfPath(failure.file), describeFailure(failure))
      if (routed.owner.length)
        throw new StopLoop('Test bugs in files no agent owns: over to the owner.', routed.owner)
      await this.repair('classify', request, routed)
      printBox('gate', line => this.log(line))
      const gate = await this.runGate()
      if (!gate.ok)
        throw new StopLoop(
          'The gate fails after the test-bug repair: over to the owner.',
          gateFailureLines(gate)
        )
      printBox('run', line => this.log(line))
      await this.executeRun(this.areaRunSteps(await this.executionPlan(request.area)))
    }
  }

  // Phase 1: the owner labels what the rules could not. Phase 2 hands this to the
  // failure-analyzer agent.
  private async triage(failures: Failure[]): Promise<void> {
    const open = failures.filter(
      failure => failure.class === 'untriaged' || failure.class === 'flaky'
    )
    if (!open.length) return
    this.log(`\n  Triage: ${open.length} failing case(s) need your call.`)
    for (const failure of open) {
      this.log('')
      this.log(`  ${failure.caseId}: ${failure.title}`)
      this.log(
        `    ${failure.file}:${failure.line} (${failure.project})${failure.step ? `, step "${failure.step}"` : ''}`
      )
      this.log(`    ${failure.reason}`)
      for (const line of truncate(failure.errors[0] ?? 'no error message', 800)
        .split(/\r?\n/)
        .slice(0, 12))
        this.log(`    │ ${line}`)
      if (failure.tracePath)
        this.log(`    trace: npx playwright show-trace "${rel(failure.tracePath)}"`)
      if (failure.class === 'flaky') {
        failure.class = await choose(this.deps.io, '    Flaky. Is the test at fault?', [
          { key: 't', value: 'test-bug', label: 'test bug: back to its agent' },
          { key: 'q', value: 'flaky', label: 'propose quarantine against a bug issue' }
        ])
        failure.reason =
          failure.class === 'flaky' ? 'owner: quarantine proposal' : 'owner: test bug'
      } else {
        failure.class = await choose(this.deps.io, '    Test bug or product bug?', [
          { key: 't', value: 'test-bug', label: 'test bug: back to its agent' },
          { key: 'p', value: 'product-bug', label: 'product bug: a bug draft' }
        ])
        failure.reason = failure.class === 'test-bug' ? 'owner: test bug' : 'owner: product bug'
      }
    }
  }

  private async writeBugDrafts(
    request: TestRequest,
    failures: Failure[],
    runId: string
  ): Promise<void> {
    const template = await readText(FILE.bugTemplate)
    const plans = await loadTestPlans(REPO_ROOT)
    const { baseUrl } = loadSettings()
    const drafts: Draft[] = []
    for (const failure of failures) {
      const plan = plans.find(candidate =>
        candidate.cases.some(plannedCase => plannedCase.id === failure.caseId)
      )
      const plannedCase = plan?.cases.find(candidate => candidate.id === failure.caseId)
      if (!plan || !plannedCase)
        throw new StopLoop(`${failure.caseId} is not a planned case, so it has no steps to report.`)
      const draft = renderBugDraft(template, {
        failure,
        plannedCase,
        area: plan.area,
        role: roleOfCase(plannedCase),
        requestIssue: request.issue,
        runId,
        date: isoDate(this.now()),
        baseUrl
      })
      const file = `.orchestrate/bugs/${failure.caseId}.md`
      await writeText(path.join(REPO_ROOT, file), draft.body)
      drafts.push({
        caseId: failure.caseId,
        area: plan.area,
        title: draft.title,
        file,
        kind: failure.class === 'flaky' ? 'flaky' : 'product-bug',
        decision: 'pending'
      })
      this.log(`  ↳ bug draft ${file}: ${draft.title}`)
    }
    await writeJson(FILE.drafts, drafts)
  }

  // ── ✋ Gate B ────────────────────────────────────────────────────────────────────────────

  private async stageGateB(): Promise<Next> {
    const title = 'each bug draft and each quarantine proposal'
    if (this.dryRun) {
      await ownerGate(
        this.deps.io,
        {
          gate: 'B',
          title,
          details: ['For each draft: file it, keep it local (security-sensitive), or drop it.']
        },
        true
      )
      return 'continue'
    }
    const drafts = await this.loadDrafts()
    if (!drafts.length) {
      this.log(`\n✋ Gate B: ${title} ── nothing to approve`)
      return 'continue'
    }
    this.log(`\n✋ Gate B: ${title}`)
    this.log(
      '   Read and edit each draft before you answer. A security-sensitive finding is never filed.'
    )
    for (const draft of drafts) {
      this.log(
        `\n   ${draft.kind === 'flaky' ? 'Quarantine proposal' : 'Product bug'} ${draft.caseId}: ${draft.title}`
      )
      this.log(`   ${draft.file}`)
      draft.decision = await choose(this.deps.io, '   File it?', [
        { key: 'f', value: 'file', label: 'file it as a GitHub issue' },
        { key: 'l', value: 'local', label: 'keep it local (security-sensitive)' },
        { key: 'd', value: 'drop', label: 'drop it' }
      ])
    }
    await writeJson(FILE.drafts, drafts)
    this.approve('B')
    return 'continue'
  }

  // ── 9 bugs ───────────────────────────────────────────────────────────────────────────────

  private async stageBugs(): Promise<Next> {
    const request = await this.loadRequest()
    const execution = await this.executionPlan(request.area)
    if (this.dryRun) {
      const caseId = '<CASE-ID>'
      const bodyFile = `.orchestrate/bugs/${caseId}.md`
      this.dry(`secretlint ${bodyFile} (through stdin), for each approved draft`)
      this.dry(
        `gh issue list --label bug --state open --search "${caseId} in:title" --json number,title (the duplicate check, a read)`
      )
      this.ensureLabels([LABEL.bug, LABEL.area(request.area)])
      this.deps.github.createIssue({
        title: `[${caseId}] <failing step>: <actual result>`,
        bodyFile,
        labels: [LABEL.bug.name, LABEL.area(request.area).name]
      })
      this.dry(
        `or, when an open issue already tracks the case: gh issue comment <n> --body-file ${bodyFile}`
      )
      await this.commentOnRequest('bugs', 'Bug issues found while testing this request: <list>')
      this.dry(
        'the owner quarantines each filed case: a row in .test/quarantine.md and @quarantine on its test'
      )
      this.dry(
        `exit criteria over the cases not quarantined: P1 ${execution.exit.p1PassRate}%, overall ${execution.exit.overallPassRate}%, ` +
          `new flaky ≤${execution.exit.maxNewFlaky}, untriaged ${execution.exit.untriagedFailures}`
      )
      return 'continue'
    }

    const drafts = await this.loadDrafts()
    const filed: FilingOutcome[] = []
    const labelled = new Set<string>()
    for (const draft of drafts.filter(candidate => candidate.decision === 'file')) {
      const findings = scanTextForSecrets(
        await readText(path.join(REPO_ROOT, draft.file)),
        path.basename(draft.file)
      )
      if (findings.length) {
        this.log(`  ✘ secretlint flagged ${draft.file}, so it stays local:`)
        for (const finding of findings) this.log(`    ${finding}`)
        draft.decision = 'local'
        continue
      }
      if (!labelled.has(draft.area)) {
        this.ensureLabels([LABEL.bug, LABEL.area(draft.area)])
        labelled.add(draft.area)
      }
      const outcome = fileBug(
        this.deps.github,
        { caseId: draft.caseId, title: draft.title, body: '' },
        draft.file,
        draft.area
      )
      filed.push(outcome)
      this.log(
        `  ↳ ${draft.caseId}: ${outcome.kind === 'created' ? 'filed' : 'added this run to'} #${outcome.number} ${outcome.url}`
      )
    }
    await writeJson(FILE.drafts, drafts)
    await writeJson(FILE.filed, filed)
    if (filed.length) {
      await this.commentOnRequest(
        'bugs',
        [
          'Bug issues found while testing this request:',
          '',
          ...filed.map(bug => `- \`${bug.caseId}\`: #${bug.number}`)
        ].join('\n')
      )
    }
    await this.awaitExitCriteria(request, execution, filed)
    return 'continue'
  }

  // ↳ The area's exit criteria over the cases that are not quarantined. The owner quarantines
  // each filed case (.test/quarantine.md is owner-only), then the driver checks again.
  private async awaitExitCriteria(
    request: TestRequest,
    execution: ExecutionPlan,
    filed: FilingOutcome[]
  ): Promise<void> {
    const state = this.requireState()
    if (!state.runId) throw new StopLoop('No test run to evaluate: resume with --from-stage run.')
    for (;;) {
      const { plan } = await this.readAreaPlans(request.area)
      const quarantine = await loadQuarantine(REPO_ROOT)
      const quarantined = new Set(quarantine.entries.map(entry => entry.caseId))
      const verdict = evaluateExitCriteria(
        execution,
        plan.cases,
        (await readSummary(state.runId)).outcomes,
        await readFailures(state.runId),
        quarantined
      )
      for (const detail of verdict.details) this.log(`  ${verdict.met ? '✔' : '·'} ${detail}`)
      if (verdict.met) return

      const missing = filed.filter(bug => !quarantined.has(bug.caseId))
      if (missing.length) {
        this.log(
          '\n  To quarantine a filed case, add its row to .test/quarantine.md and @quarantine to its test:'
        )
        for (const bug of missing)
          this.log(
            `    | ${bug.caseId} | #${bug.number} | <reason> | <your name> | ${isoDate(this.now())} |`
          )
      }
      const answer = await choose(this.deps.io, '  The area exit criteria are not met.', [
        { key: 'c', value: 'check', label: 'check again' },
        { key: 's', value: 'stop', label: 'stop' }
      ])
      if (answer === 'stop') {
        throw new StopLoop(
          'The area exit criteria are not met. Resume with --from-stage bugs once they are, or --from-stage run after a fix.'
        )
      }
    }
  }

  // ── ✋ Gate C ────────────────────────────────────────────────────────────────────────────

  private async stageGateC(): Promise<Next> {
    const request = await this.loadRequest()
    const subject = commitSubject(request.area, request.title)
    const branch = `test/${request.area}`
    const title = 'the commit and the pull request'
    const after = `Then the regression profile, git push -u origin ${branch}, and a pull request into main${request.issue ? ` that closes #${request.issue}` : ''}. Merge stays manual.`
    if (this.dryRun) {
      await ownerGate(
        this.deps.io,
        { gate: 'C', title, details: [`Commit on ${branch}: ${subject}`, after] },
        true
      )
      return 'continue'
    }
    // The owner's quarantine edits happened after the last gate run.
    const gate = await this.runGate()
    if (!gate.ok)
      throw new StopLoop(
        'The gate fails on the final tree. Fix it, then resume with --from-stage gate-c.',
        gateFailureLines(gate)
      )
    const changes = git(['status', '--short']).stdout.split(/\r?\n/).filter(Boolean)
    const details = [
      `Commit on ${branch}: ${subject}`,
      `${changes.length} changed file(s):`,
      ...changes.slice(0, 30).map(line => `  ${line}`),
      ...(changes.length > 30 ? [`  ... ${changes.length - 30} more`] : []),
      after
    ]
    if ((await ownerGate(this.deps.io, { gate: 'C', title, details }, false)) === 'reject') {
      throw new StopLoop('The owner rejected the commit at Gate C. Nothing was committed.')
    }
    this.approve('C')
    return 'continue'
  }

  // ── 10 deliver ───────────────────────────────────────────────────────────────────────────

  private async stageDeliver(): Promise<Next> {
    const request = await this.loadRequest()
    const graph = await this.loadGraph(request)
    const branch = `test/${request.area}`
    const subject = commitSubject(request.area, request.title)
    const body = [
      request.issue ? `Refs #${request.issue}` : 'Local request (no issue).',
      `Plan: ${graph.plan}`
    ].join('\n')
    const regression = [...profileSteps('setup'), ...profileSteps('regression')]

    if (this.dryRun) {
      this.gitWrite(['add', '-A'])
      this.gitWrite(['commit', '-m', subject, '-m', body])
      for (const step of regression) this.dry(commandLine(step))
      this.dry('npm run report -- --run <run-id> (the Allure report, kept local)')
      this.dry(
        'fill .github/pull_request_template.md → .orchestrate/pr-body.md, then secretlint it (through stdin)'
      )
      this.gitWrite(['push', '-u', 'origin', branch])
      this.deps.github.createPullRequest({
        title: subject,
        bodyFile: rel(FILE.prBody),
        base: 'main',
        head: branch
      })
      await this.commentOnRequest('pull-request', 'Pull request: <url>')
      return 'continue'
    }

    if (git(['status', '--porcelain']).stdout.trim()) {
      this.gitWrite(['add', '-A'])
      this.gitWrite(['commit', '-m', subject, '-m', body])
      this.log(`  ↳ committed: ${subject}`)
    } else {
      this.log('  ↳ nothing to commit: already committed')
    }

    printBox('run', line => this.log(line))
    const { runId, summary, failures } = await this.executeRun(regression)
    if (failures.length) {
      this.log(
        `  ✘ the regression run has ${failures.length} failing case(s): ${failures.map(failure => failure.caseId).join(', ')}`
      )
      const answer = await choose(
        this.deps.io,
        '  Open the pull request anyway? Its body shows the failures.',
        [
          { key: 'o', value: 'open', label: 'open it' },
          { key: 's', value: 'stop', label: 'stop (the commit stays local)' }
        ]
      )
      if (answer === 'stop')
        throw new StopLoop(
          'Stopped after the regression run. The commit is local and nothing was pushed.'
        )
    }

    const report = buildAllureReport(runId)
    if (report.code !== 0)
      this.log('  ⚠ the Allure report did not build; the PR links the raw results instead')
    const evidence = await this.prEvidence(
      request,
      graph,
      runId,
      summary,
      rel(report.code === 0 ? report.reportDir : path.join(runDir(runId), 'allure-results'))
    )
    const prBody = renderPrBody(await readText(FILE.prTemplate), evidence)
    await writeText(FILE.prBody, prBody)
    const secrets = scanTextForSecrets(prBody, 'pr-body.md')
    if (secrets.length)
      throw new StopLoop('secretlint flagged .orchestrate/pr-body.md: nothing was pushed.', secrets)

    this.gitWrite(['push', '-u', 'origin', branch])
    const pr = this.deps.github.createPullRequest({
      title: subject,
      bodyFile: rel(FILE.prBody),
      base: 'main',
      head: branch
    })
    this.log(`  ↳ pull request #${pr.number}: ${pr.url}`)
    await this.commentOnRequest('pull-request', `Pull request: ${pr.url}`)
    return 'continue'
  }

  private async prEvidence(
    request: TestRequest,
    graph: TaskGraph,
    runId: string,
    summary: RunSummary,
    allureReport: string
  ): Promise<PrEvidence> {
    const { plan, planFile } = await this.readAreaPlans(request.area)
    const onMain = git(['show', `main:${planFile}`])
    const added = newCaseIds(
      onMain.code === 0 ? parseTestPlan(onMain.stdout, request.area, planFile) : undefined,
      plan
    )
    const automated = new Set(listTests().tests.flatMap(test => test.caseIds))
    const drafts = await this.loadDrafts()
    let login: string | undefined
    try {
      login = this.deps.github.authenticatedLogin()
    } catch {
      login = undefined
    }
    return {
      requestIssue: request.issue,
      requestTitle: request.title,
      area: request.area,
      summary: [
        `Implementation plan: \`${graph.plan}\``,
        `Test plan: \`${planFile}\` (${plan.requirements.length} requirements, ${plan.cases.length} cases)`,
        added.length ? `New cases: ${added.join(', ')}` : 'No new cases: existing ones changed',
        `Regression run \`${runId}\`: ${summary.steps.map(step => `${step.step} ${step.results}`).join(', ')} result(s)`
      ],
      gate: await this.readGate(),
      runId,
      outcomes: new Map(Object.entries(summary.outcomes)),
      allureReport: `\`${allureReport}\` (built locally with \`npm run report -- --run ${runId}\`; it stays local)`,
      coverage: areaCoverage(plan, automated),
      bugs: await readIfExists(FILE.filed, z.array(FiledSchema), []),
      localBugDrafts: drafts.filter(draft => draft.decision === 'local').length,
      findings: await this.loadFindings(),
      quarantineChanges: quarantineChanges(
        git(['diff', 'main...HEAD', '--', FILE.quarantine]).stdout
      ),
      ciChecks: undefined,
      approvedBy: login ?? 'the owner',
      approvedAt: this.requireState().approvals.C ?? this.now().toISOString()
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────────

function currentBranch(): string {
  // Works on an unborn branch too, unlike rev-parse.
  return git(['branch', '--show-current']).stdout.trim()
}

// Specs added or changed on this branch, committed or not: they run newCaseRepeat times.
function changedSpecFiles(): string[] {
  const lines = (output: string) =>
    output
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
  const files = [
    ...lines(git(['diff', '--name-only', '--diff-filter=AM', 'main...HEAD', '--', 'tests']).stdout),
    ...lines(git(['diff', '--name-only', '--diff-filter=AM', 'HEAD', '--', 'tests']).stdout),
    ...lines(git(['ls-files', '--others', '--exclude-standard', '--', 'tests']).stdout)
  ]
  return [...new Set(files)].filter(file => /^tests\/(ui|api|e2e)\/.+\.spec\.ts$/.test(file)).sort()
}

// The QA user a case runs as, from its preconditions and steps.
function roleOfCase(plannedCase: PlannedCase): string {
  const text = `${plannedCase.preconditions} ${plannedCase.steps}`.toLowerCase()
  const roles = ROLES.filter(role => text.includes(role))
  return roles.length
    ? roles.map(role => `QA ${role[0]?.toUpperCase() ?? ''}${role.slice(1)}`).join(', ')
    : 'none (anonymous)'
}

function describeGraph(graph: TaskGraph): string {
  const agents = [...new Set(graph.tasks.map(task => task.agent))].join(', ')
  return (
    `${graph.tasks.length} tasks (${agents}); criteria ${graph.criteria.map(entry => entry.number).join(', ')} → ` +
    `${areasOf(graph).join(', ')}; framework work ${graph.frameworkNeeded ? 'needed' : 'not needed'}`
  )
}

function describeFailure(failure: Failure): string {
  return (
    `${failure.caseId} (${failure.file}:${failure.line}) failed${failure.step ? ` at "${failure.step}"` : ''}: ` +
    truncate(failure.errors[0] ?? 'no error message', 600)
  )
}

function rel(file: string): string {
  return path.relative(REPO_ROOT, path.resolve(REPO_ROOT, file)).replace(/\\/g, '/')
}

function firstLine(text: string): string {
  return text.split(/\r?\n/)[0] ?? ''
}

function isoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function tail(output: string, lines = 20): string[] {
  return output.split(/\r?\n/).filter(Boolean).slice(-lines)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
