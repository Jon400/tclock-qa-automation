import { parseCaseId } from '../../../src/utils/case-id'
import { tableAfterHeading } from './markdown-table'

// .test/quarantine.md: the owner-only registry. A case may carry @quarantine only while it
// has a row here, linked to the bug issue that explains it.
export interface QuarantineEntry {
  caseId: string
  issue: string
  reason: string
  approvedBy: string
  date: string
  line: number
}

export const QUARANTINE_HEADERS = ['Case ID', 'Issue', 'Reason', 'Approved by', 'Date'] as const

export function parseQuarantine(
  markdown: string,
  file = '.test/quarantine.md'
): {
  entries: QuarantineEntry[]
  errors: string[]
} {
  const errors: string[] = []
  const table = tableAfterHeading(markdown, 'Registry')
  if (!table) {
    return { entries: [], errors: [`${file}: missing "## Registry" table`] }
  }
  if (table.headers.join(' | ') !== QUARANTINE_HEADERS.join(' | ')) {
    errors.push(
      `${file}:${table.line}: the registry must have the columns ${QUARANTINE_HEADERS.join(' | ')}`
    )
  }
  const entries: QuarantineEntry[] = []
  for (const row of table.rows) {
    const caseId = row.cells['Case ID'] ?? ''
    if (!parseCaseId(caseId)) {
      errors.push(`${file}:${row.line}: "${caseId}" is not a case ID`)
      continue
    }
    const issue = row.cells.Issue ?? ''
    if (!/#\d+|github\.com\/.+\/issues\/\d+/.test(issue)) {
      errors.push(`${file}:${row.line}: ${caseId} must link its bug issue (#<n>)`)
    }
    entries.push({
      caseId,
      issue,
      reason: row.cells.Reason ?? '',
      approvedBy: row.cells['Approved by'] ?? '',
      date: row.cells.Date ?? '',
      line: row.line
    })
  }
  return { entries, errors }
}
