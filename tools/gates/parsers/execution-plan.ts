import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

// The front matter of .test/<area>/execution-plan.md. The driver reads it to run the area;
// the prose under it (data setup, serial groups, exit criteria) is for humans.
export const ExecutionPlanSchema = z.object({
  area: z.string().regex(/^[a-z][a-z0-9-]*$/),
  grep: z.string().regex(/^@[a-z][a-z0-9-]*$/),
  newCaseRepeat: z.number().int().min(1).max(10).default(3),
  serial: z.boolean().default(false),
  dependsOnProfiles: z.array(z.enum(['smoke'])).default(['smoke']),
  exit: z
    .object({
      p1PassRate: z.number().min(0).max(100).default(100),
      overallPassRate: z.number().min(0).max(100).default(100),
      maxNewFlaky: z.number().int().min(0).default(0),
      untriagedFailures: z.literal(0).default(0)
    })
    .prefault({})
})
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>

export function frontMatter(markdown: string): string | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/.exec(markdown)
  return match?.[1]
}

export function parseExecutionPlan(markdown: string, file = 'execution-plan.md'): ExecutionPlan {
  const yaml = frontMatter(markdown)
  if (yaml === undefined) {
    throw new Error(`${file}: missing YAML front matter (--- ... ---)`)
  }
  const result = ExecutionPlanSchema.safeParse(parseYaml(yaml))
  if (!result.success) {
    throw new Error(`${file}: invalid front matter:\n${z.prettifyError(result.error)}`)
  }
  if (result.data.grep !== `@${result.data.area}`) {
    throw new Error(`${file}: grep must be "@${result.data.area}" for area "${result.data.area}"`)
  }
  return result.data
}
