// The Allure report for one run of the suite.
//
//   npm run report                   the newest run under .orchestrate/runs that ran a test
//   npm run report -- --run <id>     a given run
//   npm run report -- --open         build it, then serve and open it
//
// Writes .orchestrate/runs/<run-id>/allure-report. The report stays local.

import path from 'node:path'
import { parseArgs } from 'node:util'
import { RUNS_DIR } from '../../src/config/paths'
import { isRunId } from '../../src/data/run-id'
import { exists } from '../../src/utils/file-utils'
import { REPO_ROOT } from '../gates/exec'
import { latestRun } from '../gates/test-inventory'
import { buildAllureReport } from './runner'

const { values } = parseArgs({
  options: {
    run: { type: 'string' },
    open: { type: 'boolean', default: false }
  }
})

let runId = values.run
if (runId !== undefined && !isRunId(runId)) {
  console.error(`--run expects a run id like 261016-093000-ab12, got "${runId}"`)
  process.exit(2)
}
if (runId === undefined) {
  const latest = await latestRun(RUNS_DIR)
  if (!latest) {
    console.error('No run with test results under .orchestrate/runs yet. Run the suite first.')
    process.exit(1)
  }
  runId = path.basename(latest.dir)
}
if (!(await exists(path.join(RUNS_DIR, runId, 'allure-results')))) {
  console.error(`Run ${runId} has no allure-results folder.`)
  process.exit(1)
}

const { code, reportDir } = buildAllureReport(runId, { open: values.open })
if (code === 0)
  console.log(`\nAllure report for run ${runId}: ${path.relative(REPO_ROOT, reportDir)}`)
process.exit(code)
