import { randomBytes } from 'node:crypto'

// A run id is sortable by time and short enough to prefix entity names:
// YYMMDD-HHMMSS-xxxx, in UTC, with 4 random hex characters.
const RUN_ID_PATTERN = /^\d{6}-\d{6}-[0-9a-f]{4}$/

// Everything a run creates in TClock carries this prefix, so cleanup and housekeeping can
// tell test data from real data. Never touch an entity without it.
export const QA_PREFIX = 'qa-'

export function createRunId(
  now: Date = new Date(),
  random: () => string = () => randomBytes(2).toString('hex')
): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${pad(now.getUTCFullYear() % 100)}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`
  return `${date}-${time}-${random()}`
}

export function isRunId(value: string): boolean {
  return RUN_ID_PATTERN.test(value)
}

// `qa-<runId>-<label>`: the name of an entity this run creates.
export function qaName(runId: string, label: string): string {
  if (!isRunId(runId)) {
    throw new Error(`Not a run id: "${runId}"`)
  }
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!slug) {
    throw new Error(`Entity label "${label}" has no usable characters`)
  }
  return `${QA_PREFIX}${runId}-${slug}`
}

export function isQaName(name: string): boolean {
  return name.startsWith(QA_PREFIX)
}

export function isFromRun(name: string, runId: string): boolean {
  return name.startsWith(`${QA_PREFIX}${runId}-`)
}
