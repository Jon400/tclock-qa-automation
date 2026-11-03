import { parseCaseId, parseRequirementId } from '../../../src/utils/case-id'
import { tableAfterHeading, type Table } from './markdown-table'

// .test/<area>/test-plan.md: a Requirements table and a Test Cases table, in a fixed shape.
// The test planner records intent here; whether a case is automated, and how it last ran,
// is computed by the gate into the coverage report and never typed by hand.

export const REQUIREMENT_HEADERS = ['ID', 'Requirement', 'Source', 'Status'] as const
export const CASE_HEADERS = [
  'ID',
  'Title',
  'Covers',
  'Layer',
  'Type',
  'Priority',
  'Preconditions',
  'Steps',
  'Expected',
  'Automation'
] as const

export type CaseLayer = 'ui' | 'api' | 'e2e'
export type CaseType = 'positive' | 'negative' | 'edge'
export type CasePriority = 'P1' | 'P2' | 'P3'
export type AutomationIntent = 'planned' | 'manual' | 'deferred'

export interface PlannedRequirement {
  id: string
  text: string
  source: string
  status: 'covered' | 'deferred'
  deferReason?: string
  line: number
}

export interface PlannedCase {
  id: string
  title: string
  covers: string[]
  layer: CaseLayer
  type: CaseType
  priority: CasePriority
  preconditions: string
  steps: string
  expected: string
  automation: AutomationIntent
  line: number
}

export interface TestPlan {
  area: string
  file: string
  requirements: PlannedRequirement[]
  cases: PlannedCase[]
  errors: string[]
}

const LAYERS: readonly CaseLayer[] = ['ui', 'api', 'e2e']
const TYPES: readonly CaseType[] = ['positive', 'negative', 'edge']
const PRIORITIES: readonly CasePriority[] = ['P1', 'P2', 'P3']
const AUTOMATION: readonly AutomationIntent[] = ['planned', 'manual', 'deferred']

export function parseTestPlan(markdown: string, area: string, file: string): TestPlan {
  const errors: string[] = []
  const at = (line: number) => `${file}:${line}`

  const requirementTable = tableAfterHeading(markdown, 'Requirements')
  const caseTable = tableAfterHeading(markdown, 'Test Cases')
  if (!requirementTable) errors.push(`${file}: missing "## Requirements" table`)
  if (!caseTable) errors.push(`${file}: missing "## Test Cases" table`)
  checkHeaders(requirementTable, REQUIREMENT_HEADERS, 'Requirements', file, errors)
  checkHeaders(caseTable, CASE_HEADERS, 'Test Cases', file, errors)

  const requirements: PlannedRequirement[] = []
  for (const row of requirementTable?.rows ?? []) {
    const id = row.cells.ID ?? ''
    const parsedId = parseRequirementId(id)
    if (!parsedId) {
      errors.push(`${at(row.line)}: "${id}" is not a requirement ID (<AREA>-AC-NN)`)
      continue
    }
    if (parsedId.area !== area) {
      errors.push(`${at(row.line)}: ${id} belongs to area "${parsedId.area}", not "${area}"`)
    }
    const statusCell = (row.cells.Status ?? '').trim()
    const deferred = /^deferred\b\s*[:—–-]?\s*(.*)$/i.exec(statusCell)
    let status: PlannedRequirement['status']
    let deferReason: string | undefined
    if (/^covered$/i.test(statusCell)) {
      status = 'covered'
    } else if (deferred) {
      status = 'deferred'
      deferReason = deferred[1]?.trim()
      if (!deferReason)
        errors.push(`${at(row.line)}: ${id} is deferred without a reason ("deferred: <reason>")`)
    } else {
      errors.push(
        `${at(row.line)}: ${id} has status "${statusCell}"; use "covered" or "deferred: <reason>"`
      )
      continue
    }
    requirements.push({
      id,
      text: row.cells.Requirement ?? '',
      source: row.cells.Source ?? '',
      status,
      ...(deferReason ? { deferReason } : {}),
      line: row.line
    })
  }

  const cases: PlannedCase[] = []
  for (const row of caseTable?.rows ?? []) {
    const id = row.cells.ID ?? ''
    const parsedId = parseCaseId(id)
    if (!parsedId) {
      errors.push(`${at(row.line)}: "${id}" is not a case ID (<AREA>-<UI|API|E2E>-NNN)`)
      continue
    }
    if (parsedId.area !== area) {
      errors.push(`${at(row.line)}: ${id} belongs to area "${parsedId.area}", not "${area}"`)
    }
    const layer = (row.cells.Layer ?? '').toLowerCase() as CaseLayer
    const type = (row.cells.Type ?? '').toLowerCase() as CaseType
    const priority = (row.cells.Priority ?? '').toUpperCase() as CasePriority
    const automation = (row.cells.Automation ?? '').toLowerCase() as AutomationIntent
    if (!LAYERS.includes(layer))
      errors.push(`${at(row.line)}: ${id} has layer "${row.cells.Layer}" (ui | api | e2e)`)
    else if (layer !== parsedId.layer)
      errors.push(
        `${at(row.line)}: ${id} says layer "${layer}" but its ID says "${parsedId.layer}"`
      )
    if (!TYPES.includes(type))
      errors.push(
        `${at(row.line)}: ${id} has type "${row.cells.Type}" (positive | negative | edge)`
      )
    if (!PRIORITIES.includes(priority))
      errors.push(`${at(row.line)}: ${id} has priority "${row.cells.Priority}" (P1 | P2 | P3)`)
    if (!AUTOMATION.includes(automation)) {
      errors.push(
        `${at(row.line)}: ${id} has automation "${row.cells.Automation}" (planned | manual | deferred)`
      )
    }
    const covers = (row.cells.Covers ?? '')
      .split(/[,\s]+/)
      .map(value => value.trim())
      .filter(Boolean)
    if (!covers.length)
      errors.push(`${at(row.line)}: ${id} covers nothing (a requirement ID, or "risk")`)
    cases.push({
      id,
      title: row.cells.Title ?? '',
      covers,
      layer,
      type,
      priority,
      preconditions: row.cells.Preconditions ?? '',
      steps: row.cells.Steps ?? '',
      expected: row.cells.Expected ?? '',
      automation,
      line: row.line
    })
  }

  reportDuplicates(requirements, 'requirement', file, errors)
  reportDuplicates(cases, 'case', file, errors)
  return { area, file, requirements, cases, errors }
}

function checkHeaders(
  table: Table | undefined,
  expected: readonly string[],
  name: string,
  file: string,
  errors: string[]
): void {
  if (!table) return
  const actual = table.headers.join(' | ')
  if (actual !== expected.join(' | ')) {
    errors.push(
      `${file}:${table.line}: the ${name} table must have the columns ${expected.join(' | ')}; found ${actual}`
    )
  }
}

function reportDuplicates(
  items: { id: string; line: number }[],
  kind: string,
  file: string,
  errors: string[]
): void {
  const seen = new Map<string, number>()
  for (const item of items) {
    const first = seen.get(item.id)
    if (first !== undefined) {
      errors.push(`${file}:${item.line}: duplicate ${kind} ID ${item.id} (first on line ${first})`)
    } else {
      seen.set(item.id, item.line)
    }
  }
}

// `<br>` separates lines inside a table cell.
export function cellLines(value: string): string[] {
  return value
    .split(/<br\s*\/?>/i)
    .map(line => line.trim())
    .filter(Boolean)
}
