import path from 'node:path'
import { checkWrite } from '../../.claude/hooks/lib/role-write-paths.js'
import type { ExecutionPlan } from '../gates/parsers/execution-plan'
import type { PlannedRequirement, TestPlan } from '../gates/parsers/test-plan'
import type { GateResult } from '../gates/types'
import { criterionLabel, type TestRequest } from './intake'

// The hand-off checks between two boxes (↳ in boxes.ts) that need more than a schema, plus
// the routing of a failure to the agent that owns it. Pure functions: loop.ts runs them,
// tests/unit/dev-loop tests them.

// .plan/NNN-YYYY-MM-DD-topic.md: the next free plan number (000 is the backlog).
export function nextPlanNumber(planFiles: string[]): string {
  const numbers = planFiles
    .map(file => /^(\d{3})-/.exec(path.basename(file))?.[1])
    .filter((value): value is string => value !== undefined)
    .map(Number)
  return String(Math.max(0, ...numbers) + 1).padStart(3, '0')
}

// The requirement rows the test planner made from one request criterion: Source names
// "#<issue> AC <n>" (or "#local AC <n>" for a request without an issue).
export function requirementsOfCriterion(
  request: TestRequest,
  plan: TestPlan,
  criterion: number
): PlannedRequirement[] {
  const label = criterionLabel(request, criterion).replace(/\s+/g, '\\s+')
  const pattern = new RegExp(`${label}(?!\\d)`, 'i')
  return plan.requirements.filter(requirement => pattern.test(requirement.source))
}

// Stage 2 → Gate A: both plans parse, and every request criterion is a requirement row that
// a case covers or that the planner deferred with a reason.
export function testPlanProblems(
  request: TestRequest,
  plan: TestPlan,
  execution: ExecutionPlan | Error
): string[] {
  const problems = [...plan.errors]
  if (execution instanceof Error) problems.push(execution.message)
  else if (execution.area !== request.area) {
    problems.push(
      `the execution plan is for area "${execution.area}", the request for "${request.area}"`
    )
  }
  for (const criterion of request.acceptanceCriteria) {
    const label = criterionLabel(request, criterion.number)
    const rows = requirementsOfCriterion(request, plan, criterion.number)
    if (!rows.length) {
      problems.push(
        `request criterion ${criterion.number} ("${criterion.text}") has no requirement row with Source "${label}"`
      )
      continue
    }
    for (const row of rows) {
      if (row.status === 'deferred') continue
      if (!plan.cases.some(plannedCase => plannedCase.covers.includes(row.id))) {
        problems.push(`${row.id} (${label}) is "covered" but no case covers it`)
      }
    }
  }
  return problems
}

// What Gate A shows: the request criteria the planner deferred, with the reasons.
export function deferredCriteria(request: TestRequest, plan: TestPlan): string[] {
  return request.acceptanceCriteria.flatMap(criterion =>
    requirementsOfCriterion(request, plan, criterion.number)
      .filter(row => row.status === 'deferred')
      .map(
        row =>
          `${row.id} (AC ${criterion.number}): deferred, ${row.deferReason ?? 'no reason given'}`
      )
  )
}

// Gate A turns a draft plan into an active one.
export function activateStatus(markdown: string): string {
  return markdown.replace(/^Status:[ \t]*\S.*$/m, 'Status: active')
}

// The cases a plan has now that it did not have on main.
export function newCaseIds(before: TestPlan | undefined, after: TestPlan): string[] {
  const existing = new Set(before?.cases.map(plannedCase => plannedCase.id) ?? [])
  return after.cases.map(plannedCase => plannedCase.id).filter(id => !existing.has(id))
}

export interface AreaCoverage {
  requirements: number
  covered: number
  deferred: number
  cases: number
  automated: number
}

// The PR's coverage line for one area. `automatedCaseIds` comes from `playwright test --list`.
export function areaCoverage(plan: TestPlan, automatedCaseIds: Set<string>): AreaCoverage {
  const automated = plan.cases.filter(plannedCase => automatedCaseIds.has(plannedCase.id))
  return {
    requirements: plan.requirements.length,
    covered: plan.requirements.filter(requirement =>
      automated.some(plannedCase => plannedCase.covers.includes(requirement.id))
    ).length,
    deferred: plan.requirements.filter(requirement => requirement.status === 'deferred').length,
    cases: plan.cases.length,
    automated: automated.length
  }
}

// ── routing ──────────────────────────────────────────────────────────────────────────────

export const REPAIR_ROLES = [
  'framework-architect',
  'test-planner',
  'test-developer-ui',
  'test-developer-api'
] as const
export type RepairRole = (typeof REPAIR_ROLES)[number]

// The agent whose lane holds a file, or undefined when no agent may write it.
export function ownerOfPath(file: string): RepairRole | undefined {
  const relative = file.replace(/\\/g, '/').replace(/^\.\//, '')
  return REPAIR_ROLES.find(role => checkWrite(role, relative).allowed)
}

const PATH_IN_DETAIL = /(?:^|[\s"'`(])((?:src|tests|test-data|\.test|\.doc|\.plan)[\\/][\w.@\\/-]+)/

export function pathInDetail(detail: string): string | undefined {
  return PATH_IN_DETAIL.exec(detail)?.[1]
    ?.replace(/\\/g, '/')
    .replace(/[.:]+$/, '')
}

export interface Routed {
  byRole: Map<RepairRole, string[]>
  // Lines that name no agent's file: a crashed check, a config or tooling problem.
  owner: string[]
}

export function emptyRouting(): Routed {
  return { byRole: new Map(), owner: [] }
}

export function addRouted(routed: Routed, role: RepairRole | undefined, item: string): void {
  if (!role) {
    routed.owner.push(item)
    return
  }
  routed.byRole.set(role, [...(routed.byRole.get(role) ?? []), item])
}

// Each failed gate detail goes to the agent whose lane holds the file it names.
export function routeGateFailures(gate: GateResult, routed: Routed = emptyRouting()): Routed {
  for (const check of gate.checks.filter(candidate => candidate.status === 'failed')) {
    const details = check.details.length ? check.details : [check.summary]
    for (const detail of details) {
      const file = pathInDetail(detail)
      addRouted(routed, file ? ownerOfPath(file) : undefined, `gate ${check.id}: ${detail}`)
    }
  }
  return routed
}

export function gateFailureLines(gate: GateResult): string[] {
  return gate.checks
    .filter(check => check.status === 'failed')
    .flatMap(check =>
      (check.details.length ? check.details : [check.summary]).map(
        detail => `${check.id}: ${detail}`
      )
    )
}

// ── delivery ─────────────────────────────────────────────────────────────────────────────

// A request title without a leading "<area>:" (the backlog line's format).
export function titleWithoutArea(area: string, title: string): string {
  return title.trim().replace(new RegExp(`^${area}\\s*:\\s*`, 'i'), '')
}

// A Conventional Commit header that commitlint accepts: lower-case start, no full stop,
// at most 100 characters.
export function commitSubject(area: string, title: string): string {
  const subject = titleWithoutArea(area, title)
    .replace(/[.\s]+$/, '')
    .replace(/^[A-Z](?![A-Z])/, letter => letter.toLowerCase())
  const header = `test(${area}): cover ${subject}`
  return header.length > 100 ? header.slice(0, 100).replace(/\s+\S*$/, '') : header
}

// Rows added to or removed from the quarantine registry on this branch, from `git diff`.
export function quarantineChanges(diff: string): string[] {
  return diff
    .split(/\r?\n/)
    .filter(line => /^[+-]\|\s*[A-Z]/.test(line) && !/^[+-]\|\s*Case ID\b/.test(line))
    .map(line => `${line.startsWith('+') ? 'added' : 'removed'}: ${line.slice(1).trim()}`)
}
