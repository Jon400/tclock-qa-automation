import { parseCaseId } from '../../../src/utils/case-id'
import type { QuarantineEntry } from '../parsers/quarantine'
import type { PlannedCase, TestPlan } from '../parsers/test-plan'
import { CASE_PROJECTS, type ReportedTest } from '../test-inventory'
import { verdict, type CheckResult } from '../types'

export interface TraceabilityInput {
  plans: TestPlan[]
  tests: ReportedTest[]
  quarantine: QuarantineEntry[]
  quarantineErrors?: string[]
}

// Requirement → case → test, both ways:
// - every test traces to exactly one planned case, in the right layer, with its area tag;
// - every requirement is covered by a case or deferred with a reason;
// - every planned case has a test, and no manual or deferred case has one;
// - @quarantine only for cases in the owner's registry.
export function checkTraceability(input: TraceabilityInput): CheckResult {
  const findings: string[] = [...(input.quarantineErrors ?? [])]
  const casesById = new Map<string, { plannedCase: PlannedCase; plan: TestPlan }>()

  for (const plan of input.plans) {
    findings.push(...plan.errors)
    for (const plannedCase of plan.cases) {
      const other = casesById.get(plannedCase.id)
      if (other) {
        findings.push(
          `${plan.file}:${plannedCase.line}: case ${plannedCase.id} is also defined in ${other.plan.file}`
        )
      } else {
        casesById.set(plannedCase.id, { plannedCase, plan })
      }
    }
  }

  const quarantined = new Set(input.quarantine.map(entry => entry.caseId))
  const caseTests = input.tests.filter(test =>
    (CASE_PROJECTS as readonly string[]).includes(test.project)
  )
  const testsByCase = new Map<string, ReportedTest[]>()

  for (const test of caseTests) {
    const where = `${test.file}:${test.line} "${test.title}"`
    const [caseId, ...extra] = test.caseIds
    if (!caseId || extra.length) {
      findings.push(
        `${where}: needs exactly one case annotation, has ${test.caseIds.length}. Use testCase('<CASE-ID>')`
      )
      continue
    }
    testsByCase.set(caseId, [...(testsByCase.get(caseId) ?? []), test])

    const planned = casesById.get(caseId)
    if (!planned) {
      findings.push(`${where}: case ID ${caseId} is not in any .test/<area>/test-plan.md`)
      continue
    }
    const parsedId = parseCaseId(caseId)
    const folderLayer = /^tests\/(ui|api|e2e)\//.exec(test.file)?.[1]
    if (parsedId && folderLayer && folderLayer !== parsedId.layer) {
      findings.push(
        `${where}: ${caseId} is a ${parsedId.layer} case but the test lives in tests/${folderLayer}/`
      )
    }
    if (!test.tags.includes(`@${planned.plan.area}`)) {
      findings.push(`${where}: missing the area tag @${planned.plan.area}`)
    }
    if (test.tags.includes('@quarantine') && !quarantined.has(caseId)) {
      findings.push(
        `${where}: tagged @quarantine but ${caseId} has no entry in .test/quarantine.md`
      )
    }
  }

  for (const entry of input.quarantine) {
    if (!casesById.has(entry.caseId)) {
      findings.push(`.test/quarantine.md:${entry.line}: ${entry.caseId} is not a planned case`)
    }
  }

  for (const plan of input.plans) {
    const requirementIds = new Set(plan.requirements.map(requirement => requirement.id))
    for (const plannedCase of plan.cases) {
      for (const covered of plannedCase.covers) {
        if (covered !== 'risk' && !requirementIds.has(covered)) {
          findings.push(
            `${plan.file}:${plannedCase.line}: ${plannedCase.id} covers unknown requirement ${covered}`
          )
        }
      }
      const tests = testsByCase.get(plannedCase.id) ?? []
      if (plannedCase.automation === 'planned' && !tests.length) {
        findings.push(
          `${plan.file}:${plannedCase.line}: ${plannedCase.id} is planned but no test carries its case annotation`
        )
      }
      if (plannedCase.automation !== 'planned' && tests.length) {
        findings.push(
          `${plan.file}:${plannedCase.line}: ${plannedCase.id} is marked ${plannedCase.automation} but has a test; mark it planned`
        )
      }
    }
    for (const requirement of plan.requirements) {
      const coveredBy = plan.cases.filter(plannedCase =>
        plannedCase.covers.includes(requirement.id)
      )
      if (requirement.status === 'covered' && !coveredBy.length) {
        findings.push(
          `${plan.file}:${requirement.line}: ${requirement.id} is not covered by any case and not deferred`
        )
      }
    }
  }

  const summary = `${caseTests.length} tests → ${casesById.size} cases → ${input.plans.reduce((sum, plan) => sum + plan.requirements.length, 0)} requirements`
  return verdict('traceability', 'Traceability and AC coverage', findings, summary)
}
