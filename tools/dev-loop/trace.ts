import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { writeJson } from '../../src/utils/file-utils'
import { REPO_ROOT } from '../gates/exec'

// .orchestrate/trace.json: cost and duration per agent stage, appended across a run.
export interface TraceEntry {
  stage: string
  role: string
  agent: string
  startedAt: string
  durationMs: number
  costUsd: number
  turns: number
  outcome: string
}

export const TRACE_FILE = path.join(REPO_ROOT, '.orchestrate', 'trace.json')

export class Trace {
  constructor(private readonly file: string = TRACE_FILE) {}

  async record(entry: TraceEntry): Promise<void> {
    const existing = await this.read()
    await writeJson(this.file, [...existing, entry])
  }

  async read(): Promise<TraceEntry[]> {
    const text = await readFile(this.file, 'utf8').catch(() => '[]')
    return JSON.parse(text) as TraceEntry[]
  }

  async totalCostUsd(): Promise<number> {
    return (await this.read()).reduce((sum, entry) => sum + entry.costUsd, 0)
  }
}
