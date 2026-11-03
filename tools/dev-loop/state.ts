import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { writeJson } from '../../src/utils/file-utils'
import { REPO_ROOT } from '../gates/exec'

// .orchestrate/loop-state.json: where a run is, so --from-stage can resume it.

export const STAGE_IDS = [
  'request',
  'gate-0',
  'intake',
  'scope',
  'plan-tests',
  'gate-a',
  'framework',
  'implement',
  'gate',
  'review',
  'run',
  'classify',
  'gate-b',
  'bugs',
  'gate-c',
  'deliver'
] as const
export type StageId = (typeof STAGE_IDS)[number]

export const LoopStateSchema = z.object({
  version: z.literal(1),
  requestIssue: z.number().int().nullable(),
  area: z.string(),
  branch: z.string(),
  runId: z.string().optional(),
  completed: z.array(z.enum(STAGE_IDS)),
  reviewRounds: z.number().int().default(0),
  repairRounds: z.number().int().default(0),
  // Gate → when the owner approved it (ISO time).
  approvals: z.record(z.string(), z.string()).default({}),
  updatedAt: z.string()
})
export type LoopState = z.infer<typeof LoopStateSchema>

export const STATE_FILE = path.join(REPO_ROOT, '.orchestrate', 'loop-state.json')

export async function loadState(file = STATE_FILE): Promise<LoopState | undefined> {
  const text = await readFile(file, 'utf8').catch(() => undefined)
  return text ? LoopStateSchema.parse(JSON.parse(text)) : undefined
}

export async function saveState(state: LoopState, file = STATE_FILE): Promise<void> {
  await writeJson(file, { ...state, updatedAt: new Date().toISOString() })
}

// With --from-stage, every stage before it counts as done.
export function stagesBefore(stage: StageId): StageId[] {
  return STAGE_IDS.slice(0, STAGE_IDS.indexOf(stage))
}
