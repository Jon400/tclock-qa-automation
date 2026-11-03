export type CheckStatus = 'passed' | 'failed' | 'skipped'

export interface CheckResult {
  id: string
  title: string
  status: CheckStatus
  summary: string
  details: string[]
  durationMs?: number
}

export interface GateResult {
  ok: boolean
  startedAt: string
  durationMs: number
  base: string
  allowAssertionChange: boolean
  checks: CheckResult[]
}

export function passed(
  id: string,
  title: string,
  summary: string,
  details: string[] = []
): CheckResult {
  return { id, title, status: 'passed', summary, details }
}

export function failed(id: string, title: string, summary: string, details: string[]): CheckResult {
  return { id, title, status: 'failed', summary, details }
}

export function skipped(id: string, title: string, summary: string): CheckResult {
  return { id, title, status: 'skipped', summary, details: [] }
}

// A check fails or passes on its findings alone.
export function verdict(
  id: string,
  title: string,
  findings: string[],
  okSummary: string
): CheckResult {
  return findings.length
    ? failed(id, title, `${findings.length} finding${findings.length === 1 ? '' : 's'}`, findings)
    : passed(id, title, okSummary)
}
