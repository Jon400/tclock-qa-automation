// The quality gate. Ordinary code decides whether agent work is accepted: the exit code is
// the verdict, never an agent's report.
//
//   npm run gate                               every check
//   npm run gate -- --only typecheck,eslint    a subset
//   npm run gate -- --allow-assertion-change   owner only; tools/dev-loop never passes it
//
// Writes .orchestrate/gate.json and .orchestrate/coverage-report.md.

import path from 'node:path'
import { parseArgs } from 'node:util'
import { writeJson, writeText } from '../../src/utils/file-utils'
import { REPO_ROOT } from './exec'
import { CHECK_IDS, runGate, type CheckId } from './run-gate'
import type { CheckResult } from './types'

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    skip: { type: 'string' },
    base: { type: 'string', default: 'main' },
    'allow-assertion-change': { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false }
  }
})

const parseIds = (value: string | undefined): CheckId[] | undefined => {
  if (!value) return undefined
  const ids = value.split(',').map(id => id.trim())
  const unknown = ids.filter(id => !(CHECK_IDS as readonly string[]).includes(id))
  if (unknown.length) {
    console.error(`Unknown check(s): ${unknown.join(', ')}. Known: ${CHECK_IDS.join(', ')}`)
    process.exit(2)
  }
  return ids as CheckId[]
}

const only = parseIds(values.only)
const skip = new Set(parseIds(values.skip) ?? [])
const checks = (only ?? [...CHECK_IDS]).filter(id => !skip.has(id))

const icon = { passed: '✔', failed: '✘', skipped: '–' } as const
const print = (check: CheckResult) => {
  const seconds = ((check.durationMs ?? 0) / 1000).toFixed(1)
  console.log(`${icon[check.status]} ${check.title.padEnd(36)} ${check.summary} (${seconds}s)`)
  if (check.status === 'failed' && !values.quiet) {
    for (const detail of check.details.slice(0, 25)) console.log(`    ${detail}`)
    if (check.details.length > 25)
      console.log(`    ... ${check.details.length - 25} more in .orchestrate/gate.json`)
  }
}

const { result, coverageReport } = await runGate({
  cwd: REPO_ROOT,
  checks,
  base: values.base,
  allowAssertionChange: values['allow-assertion-change'],
  onCheck: print
})

const orchestrate = path.join(REPO_ROOT, '.orchestrate')
await writeJson(path.join(orchestrate, 'gate.json'), result)
if (coverageReport) await writeText(path.join(orchestrate, 'coverage-report.md'), coverageReport)

console.log(
  `\nGate ${result.ok ? 'PASSED' : 'FAILED'} in ${(result.durationMs / 1000).toFixed(1)}s → .orchestrate/gate.json`
)
process.exit(result.ok ? 0 : 1)
