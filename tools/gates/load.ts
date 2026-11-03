import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { parseQuarantine, type QuarantineEntry } from './parsers/quarantine'
import { parseTestPlan, type TestPlan } from './parsers/test-plan'

export const TEST_DIR = '.test'

// Every .test/<area>/test-plan.md, parsed. The folder name is the area.
export async function loadTestPlans(cwd: string): Promise<TestPlan[]> {
  const root = path.join(cwd, TEST_DIR)
  const entries = await readdir(root, { withFileTypes: true }).catch(() => [])
  const plans: TestPlan[] = []
  for (const entry of entries
    .filter(candidate => candidate.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.posix.join(TEST_DIR, entry.name, 'test-plan.md')
    const markdown = await readFile(path.join(cwd, file), 'utf8').catch(() => undefined)
    if (markdown !== undefined) plans.push(parseTestPlan(markdown, entry.name, file))
  }
  return plans
}

export async function loadQuarantine(
  cwd: string
): Promise<{ entries: QuarantineEntry[]; errors: string[] }> {
  const file = path.posix.join(TEST_DIR, 'quarantine.md')
  const markdown = await readFile(path.join(cwd, file), 'utf8').catch(() => undefined)
  if (markdown === undefined)
    return { entries: [], errors: [`${file}: missing (the owner's quarantine registry)`] }
  return parseQuarantine(markdown, file)
}
