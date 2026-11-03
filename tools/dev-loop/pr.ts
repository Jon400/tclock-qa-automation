import type { CaseOutcome } from '../gates/coverage-report'
import type { GateResult } from '../gates/types'
import type { FilingOutcome } from './bug'
import type { PrCheck } from './github'
import { redact } from './redact'
import { fillTemplate, markdownTable } from './render'

// Stage 10: the validated pull request. The driver fills .github/pull_request_template.md
// from files the loop produced; no agent writes the evidence.

export interface ReviewFinding {
  id: string
  severity: 'blocker' | 'should-fix' | 'nit'
  owner: string
  file: string
  message: string
  resolution: string
}

export interface PrEvidence {
  requestIssue: number | null
  requestTitle: string
  area: string
  summary: string[]
  gate: GateResult
  runId: string
  // The regression run, per case.
  outcomes: Map<string, CaseOutcome>
  allureReport: string
  coverage: {
    requirements: number
    covered: number
    deferred: number
    cases: number
    automated: number
  }
  bugs: FilingOutcome[]
  localBugDrafts: number
  findings: ReviewFinding[]
  quarantineChanges: string[]
  // GitHub Actions checks, once CI exists. Undefined means "local run".
  ciChecks: PrCheck[] | undefined
  approvedBy: string
  approvedAt: string
}

export function renderPrBody(template: string, evidence: PrEvidence): string {
  const outcomes = [...evidence.outcomes.entries()].sort(([a], [b]) => a.localeCompare(b))
  const count = (state: CaseOutcome) => outcomes.filter(([, outcome]) => outcome === state).length

  const ci = evidence.ciChecks
    ? markdownTable(
        ['Check', 'State'],
        evidence.ciChecks.map(check => [
          check.link ? `[${check.name}](${check.link})` : check.name,
          check.state
        ])
      )
    : [
        `Local run \`${evidence.runId}\` (CI arrives with the CI backlog item).`,
        '',
        markdownTable(
          ['Gate check', 'Result'],
          evidence.gate.checks.map(check => [check.title, `${check.status}: ${check.summary}`])
        ),
        '',
        `Gate: **${evidence.gate.ok ? 'passed' : 'failed'}**. Regression: ${count('passed')} passed, ${count('failed')} failed, ${count('flaky')} flaky.`
      ].join('\n')

  const body = fillTemplate(template, {
    Request: evidence.requestIssue
      ? `Closes #${evidence.requestIssue} — ${evidence.requestTitle}`
      : `Local request (no issue): ${evidence.requestTitle}`,
    Summary: [`Area: \`${evidence.area}\``, '', ...evidence.summary.map(line => `- ${line}`)].join(
      '\n'
    ),
    'CI results': ci,
    'Allure evidence': [
      markdownTable(
        ['Case', 'Result'],
        outcomes.map(([caseId, outcome]) => [caseId, outcome])
      ),
      '',
      `Full report: ${evidence.allureReport}`
    ].join('\n'),
    'Coverage report': [
      `${evidence.coverage.covered} of ${evidence.coverage.requirements} requirements covered` +
        (evidence.coverage.deferred
          ? ` (${evidence.coverage.deferred} deferred with owner approval)`
          : '') +
        `; ${evidence.coverage.automated} of ${evidence.coverage.cases} cases automated.`,
      '',
      'Requirement → cases → tests → last result: `.orchestrate/coverage-report.md` (computed by the gate).'
    ].join('\n'),
    'Bug issues': [
      evidence.bugs.length
        ? evidence.bugs
            .map(
              bug =>
                `- \`${bug.caseId}\`: #${bug.number} (${bug.kind === 'created' ? 'filed' : 'new run added'})`
            )
            .join('\n')
        : '- No product bugs filed.',
      evidence.localBugDrafts
        ? `- ${evidence.localBugDrafts} security-sensitive draft(s) kept local.`
        : ''
    ]
      .filter(Boolean)
      .join('\n'),
    'Review findings': evidence.findings.length
      ? markdownTable(
          ['Finding', 'Severity', 'Owner', 'File', 'Resolution'],
          evidence.findings.map(finding => [
            `${finding.id}: ${finding.message}`,
            finding.severity,
            finding.owner,
            finding.file,
            finding.resolution
          ])
        )
      : 'No findings.',
    'Quarantine changes': evidence.quarantineChanges.length
      ? evidence.quarantineChanges.map(change => `- ${change}`).join('\n')
      : 'None.',
    'Human approval': `Gate C approved by ${evidence.approvedBy} at ${evidence.approvedAt}. Merge stays manual.`
  })
  return redact(body)
}
