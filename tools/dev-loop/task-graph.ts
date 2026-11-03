import { z } from 'zod'
import { checkWrite } from '../../.claude/hooks/lib/role-write-paths.js'
import type { TestRequest } from './intake'

// The orchestrator's plan as data: which agent does what, in which order, writing where.
// The driver validates it in code before any other agent starts.

export const WORKER_ROLES = [
  'test-planner',
  'framework-architect',
  'test-developer-ui',
  'test-developer-api',
  'code-reviewer'
] as const
export type WorkerRole = (typeof WORKER_ROLES)[number]

export const TaskGraphSchema = z.object({
  request: z.number().int().positive().nullable(),
  plan: z
    .string()
    .regex(
      /^\.plan\/\d{3}-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$/,
      'plan must be .plan/NNN-YYYY-MM-DD-topic.md'
    ),
  criteria: z
    .array(
      z.object({ number: z.number().int().positive(), area: z.string().regex(/^[a-z][a-z0-9-]*$/) })
    )
    .min(1),
  frameworkNeeded: z.boolean(),
  tasks: z
    .array(
      z.object({
        id: z.string().regex(/^[a-z][a-z0-9-]*$/),
        agent: z.enum(WORKER_ROLES),
        dependsOn: z.array(z.string()),
        summary: z.string().min(1),
        writes: z.array(z.string().min(1))
      })
    )
    .min(1)
})
export type TaskGraph = z.infer<typeof TaskGraphSchema>

export class TaskGraphError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid task graph:\n${problems.map(problem => `  - ${problem}`).join('\n')}`)
    this.name = 'TaskGraphError'
  }
}

export function validateTaskGraph(raw: unknown, request: TestRequest): TaskGraph {
  const parsed = TaskGraphSchema.safeParse(raw)
  if (!parsed.success) {
    throw new TaskGraphError(
      parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
    )
  }
  const graph = parsed.data
  const problems: string[] = []

  // Every acceptance criterion of the request is assigned to exactly one area.
  for (const criterion of request.acceptanceCriteria) {
    const assigned = graph.criteria.filter(entry => entry.number === criterion.number)
    if (assigned.length !== 1) {
      problems.push(
        `acceptance criterion ${criterion.number} is assigned ${assigned.length} times (needs exactly 1)`
      )
    }
  }
  for (const entry of graph.criteria) {
    if (!request.acceptanceCriteria.some(criterion => criterion.number === entry.number)) {
      problems.push(`criterion ${entry.number} is not in the request`)
    }
  }

  // Tasks form a DAG over known ids, and each task writes only inside its agent's lane.
  const ids = new Set<string>()
  for (const task of graph.tasks) {
    if (ids.has(task.id)) problems.push(`duplicate task id "${task.id}"`)
    ids.add(task.id)
  }
  for (const task of graph.tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency))
        problems.push(`task "${task.id}" depends on unknown task "${dependency}"`)
    }
    for (const target of task.writes) {
      const verdict = checkWrite(task.agent, target.replace(/\/$/, '/x'))
      if (!verdict.allowed)
        problems.push(`task "${task.id}" (${task.agent}) cannot write ${target}: ${verdict.reason}`)
    }
  }
  if (hasCycle(graph)) problems.push('task dependencies form a cycle')

  const agents = new Set(graph.tasks.map(task => task.agent))
  if (!agents.has('test-planner')) problems.push('no test-planner task')
  if (!agents.has('code-reviewer')) problems.push('no code-reviewer task')
  if (graph.frameworkNeeded !== agents.has('framework-architect')) {
    problems.push('frameworkNeeded must be true exactly when a framework-architect task exists')
  }

  if (problems.length) throw new TaskGraphError(problems)
  return graph
}

function hasCycle(graph: TaskGraph): boolean {
  const byId = new Map(graph.tasks.map(task => [task.id, task]))
  const state = new Map<string, 'visiting' | 'done'>()
  const visit = (id: string): boolean => {
    if (state.get(id) === 'done') return false
    if (state.get(id) === 'visiting') return true
    state.set(id, 'visiting')
    const cyclic = (byId.get(id)?.dependsOn ?? []).some(visit)
    state.set(id, 'done')
    return cyclic
  }
  return graph.tasks.some(task => visit(task.id))
}

export function areasOf(graph: TaskGraph): string[] {
  return [...new Set(graph.criteria.map(entry => entry.area))]
}
