// The dev loop: one run per test request. Every run ends in a validated pull request and one
// GitHub issue per product bug the new tests found.
//
//   npm run loop -- --prompt "<what to test>"   the orchestrator drafts the request; Gate 0 files it
//   npm run loop -- --issue <n>                 the owner already filed the request issue
//   npm run loop -- --next                      the next unchecked backlog line and its issue
//   npm run loop -- --request-file <file>       a local request file (offline runs and tests)
//   npm run loop -- --from-stage <stage>        resume the run in .orchestrate/loop-state.json
//   add --dry-run to any of them                print every stage, gate and write; change nothing
//
// Stages: request, gate-0, intake, scope, plan-tests, gate-a, framework, implement, gate,
// review, run, classify, gate-b, bugs, gate-c, deliver.

import { parseArgs } from 'node:util'
import type { AgentRunner } from './agents'
import { SdkAgentRunner } from './agents'
import { GitHub } from './github'
import { runLoop, type LoopSource } from './loop'
import { terminalIO } from './owner'
import { STAGE_IDS, type StageId } from './state'
import { Trace } from './trace'

function usage(problem: string): never {
  console.error(`${problem}\n`)
  console.error(
    'Usage: npm run loop -- (--prompt "<text>" | --issue <n> | --next | --request-file <file>) [--dry-run]'
  )
  console.error('       npm run loop -- --from-stage <stage> [--dry-run]')
  console.error(`Stages: ${STAGE_IDS.join(', ')}`)
  process.exit(2)
}

const { values } = parseArgs({
  options: {
    prompt: { type: 'string' },
    issue: { type: 'string' },
    next: { type: 'boolean', default: false },
    'request-file': { type: 'string' },
    'from-stage': { type: 'string' },
    'dry-run': { type: 'boolean', default: false }
  }
})

const fromStage = values['from-stage'] as StageId | undefined
if (fromStage !== undefined && !STAGE_IDS.includes(fromStage))
  usage(`Unknown stage "${fromStage}".`)

const sources: LoopSource[] = []
if (values.prompt !== undefined) {
  if (!values.prompt.trim()) usage('--prompt needs the text of what to test.')
  sources.push({ kind: 'prompt', prompt: values.prompt.trim() })
}
if (values.issue !== undefined) {
  const issue = Number(values.issue.replace(/^#/, ''))
  if (!Number.isInteger(issue) || issue <= 0)
    usage(`--issue expects an issue number, got "${values.issue}".`)
  sources.push({ kind: 'issue', issue })
}
if (values.next) sources.push({ kind: 'next' })
if (values['request-file'] !== undefined)
  sources.push({ kind: 'file', file: values['request-file'] })

if (sources.length > 1) usage('Pass one of --prompt, --issue, --next or --request-file.')
const [given] = sources
// Past intake, a resumed run reads its request from .orchestrate/request.json.
const resumesPastIntake =
  fromStage !== undefined && STAGE_IDS.indexOf(fromStage) > STAGE_IDS.indexOf('intake')
let source: LoopSource
if (given) {
  if (resumesPastIntake)
    usage(
      `--from-stage ${fromStage} resumes the request in .orchestrate/request.json; drop the request option.`
    )
  source = given
} else if (fromStage === 'gate-0' || resumesPastIntake) {
  source = { kind: 'resume' }
} else {
  usage('Pass one of --prompt, --issue, --next or --request-file.')
}
if (fromStage === 'request' && source.kind !== 'prompt')
  usage('--from-stage request needs --prompt.')

const dryRun = values['dry-run']
const trace = new Trace()

// A dry run must never reach an agent: this runner fails loudly if one is ever asked for.
const noAgents: AgentRunner = {
  run: call =>
    Promise.reject(
      new Error(`A dry run never spawns an agent (asked for ${call.role} at ${call.stage}).`)
    )
}

const costBefore = await trace.totalCostUsd()
const code = await runLoop(
  { source, dryRun, fromStage },
  {
    io: terminalIO,
    github: new GitHub({ dryRun }),
    agents: dryRun ? noAgents : new SdkAgentRunner(trace),
    log: line => console.log(line)
  }
)
if (!dryRun) {
  const cost = (await trace.totalCostUsd()) - costBefore
  console.log(`\nAgent cost this run: $${cost.toFixed(2)} (per stage in .orchestrate/trace.json)`)
}
process.exit(code)
