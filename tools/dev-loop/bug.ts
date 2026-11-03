import { cellLines, type PlannedCase } from '../gates/parsers/test-plan'
import type { Failure } from './classify'
import type { GitHub } from './github'
import { redact } from './redact'
import { fillTemplate } from './render'

// Stage 9: one GitHub issue per product bug, rendered from .github/ISSUE_TEMPLATE/bug-report.md
// out of the case's row in the test plan and the error message. Nothing else goes in: no
// trace, no screenshot, no cookie, no company data.

export interface BugContext {
  failure: Failure
  plannedCase: PlannedCase
  area: string
  role: string
  requestIssue: number | null
  runId: string
  date: string
  baseUrl: string
}

export interface BugDraft {
  caseId: string
  title: string
  body: string
}

const MAX_TITLE = 120

export function bugTitle(failure: Failure): string {
  const step = failure.step ?? 'Test'
  const actual = firstLine(failure.errors[0] ?? 'failed')
  const title = redact(`[${failure.caseId}] ${step}: ${actual}`)
  return title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title
}

export function renderBugDraft(template: string, context: BugContext): BugDraft {
  const { failure, plannedCase } = context
  const numbered = (value: string) => cellLines(value).join('\n')
  const actual = [
    `Failing step: ${failure.step ?? '(not inside a named step)'}`,
    '',
    '```',
    ...failure.errors.map(error => truncate(error, 1500)),
    '```',
    '',
    `Failed ${failure.failed} of ${failure.failed + failure.passed} attempt(s).`
  ].join('\n')

  const body = fillTemplate(template, {
    Case: [
      `- Case: \`${failure.caseId}\` — ${plannedCase.title}`,
      `- Area: \`${context.area}\``,
      `- Role: ${context.role}`,
      `- Request: ${context.requestIssue ? `#${context.requestIssue}` : '(local request)'}`
    ].join('\n'),
    Environment: [
      `- Host: ${context.baseUrl}`,
      '- Browser: Chromium (Playwright), locale he-IL, timezone Asia/Jerusalem',
      `- Run: \`${context.runId}\``,
      `- Date: ${context.date}`
    ].join('\n'),
    Steps: [
      `Preconditions: ${plannedCase.preconditions || 'none'}`,
      '',
      numbered(plannedCase.steps)
    ].join('\n'),
    Expected: numbered(plannedCase.expected),
    Actual: actual,
    Evidence: [
      `- Run ID: \`${context.runId}\``,
      `- Local trace: ${failure.tracePath ? `\`${localPath(failure.tracePath)}\`` : 'none recorded'} (stays on the owner's machine)`,
      `- Test: \`${failure.file}:${failure.line}\``
    ].join('\n')
  })
  return { caseId: failure.caseId, title: bugTitle(failure), body: redact(body) }
}

export type FilingOutcome =
  | { kind: 'created'; caseId: string; number: number; url: string }
  | { kind: 'commented'; caseId: string; number: number; url: string }

// Files a draft, or adds the run to the open issue that already tracks this case.
export function fileBug(
  github: GitHub,
  draft: BugDraft,
  bodyFile: string,
  area: string
): FilingOutcome {
  const [existing] = github.openBugsForCase(draft.caseId)
  if (existing) {
    const url = github.commentOnIssue(existing.number, bodyFile)
    return { kind: 'commented', caseId: draft.caseId, number: existing.number, url }
  }
  const created = github.createIssue({
    title: draft.title,
    bodyFile,
    labels: ['bug', `area:${area}`]
  })
  return { kind: 'created', caseId: draft.caseId, ...created }
}

function firstLine(text: string): string {
  return (
    text
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !/^(Error|expect\()/.test(line)) ??
    text.split(/\r?\n/)[0]?.trim() ??
    'failed'
  )
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… (truncated)` : text
}

// Repository-relative when possible: the absolute path would show the owner's user name.
function localPath(file: string): string {
  const normalized = file.replace(/\\/g, '/')
  const index = normalized.indexOf('.orchestrate/')
  return index >= 0 ? normalized.slice(index) : normalized.split('/').slice(-3).join('/')
}
