import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'
import { REPO_ROOT } from '../gates/exec'
import type { Trace } from './trace'

// Runs one agent stage through the Claude Agent SDK:
// - the agent's own definition (.claude/agents/<name>.md: prompt, tools, model);
// - the project settings, so CLAUDE.md, the rules and the hooks all apply;
// - AGENT_ROLE in its environment, which the boundary hook enforces;
// - permission mode dontAsk with the agent's tools pre-approved: anything else is denied;
// - a turn cap, a dollar cap, and a JSON schema for its final summary.
// The summary only routes the loop. Pass or fail always comes from the gate and the tests.

export const AGENT_OF_ROLE = {
  orchestrator: 'orchestrator',
  'test-planner': 'test-planner',
  'framework-architect': 'framework-architect',
  'test-developer-ui': 'test-developer',
  'test-developer-api': 'test-developer',
  'code-reviewer': 'code-reviewer'
} as const
export type AgentRole = keyof typeof AGENT_OF_ROLE

export const AgentStatusSchema = z.object({
  status: z.enum(['done', 'blocked']),
  summary: z.string()
})

export interface AgentCall<T> {
  stage: string
  role: AgentRole
  prompt: string
  output: z.ZodType<T>
  maxTurns: number
  maxBudgetUsd: number
}

export type AgentOutcome<T> =
  { ok: true; output: T; costUsd: number } | { ok: false; error: string; costUsd: number }

export interface AgentDefinition {
  name: string
  tools: string[]
  model: string | undefined
}

export async function readAgentDefinition(name: string): Promise<AgentDefinition> {
  const file = path.join(REPO_ROOT, '.claude', 'agents', `${name}.md`)
  const text = await readFile(file, 'utf8')
  const frontMatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
  if (!frontMatter) throw new Error(`${file}: missing front matter`)
  const data = z
    .object({ name: z.string(), tools: z.string(), model: z.string().optional() })
    .parse(parseYaml(frontMatter))
  return {
    name: data.name,
    tools: data.tools
      .split(',')
      .map(tool => tool.trim())
      .filter(Boolean),
    model: data.model
  }
}

export interface AgentRunner {
  run<T>(call: AgentCall<T>): Promise<AgentOutcome<T>>
}

export class SdkAgentRunner implements AgentRunner {
  constructor(
    private readonly trace: Trace,
    private readonly log: (line: string) => void = console.log
  ) {}

  async run<T>(call: AgentCall<T>): Promise<AgentOutcome<T>> {
    const name = AGENT_OF_ROLE[call.role]
    const definition = await readAgentDefinition(name)
    // Loaded only for a real run: dry runs and unit tests never touch the SDK.
    const { query } = await import('@anthropic-ai/claude-agent-sdk')

    const started = Date.now()
    this.log(
      `  → ${call.role} (${name}, ${definition.model ?? 'default model'}) — max ${call.maxTurns} turns, $${call.maxBudgetUsd}`
    )
    let result: SDKResultMessage | undefined
    for await (const message of query({
      prompt: call.prompt,
      options: {
        agent: name,
        cwd: REPO_ROOT,
        settingSources: ['project'],
        env: { ...process.env, AGENT_ROLE: call.role },
        permissionMode: 'dontAsk',
        allowedTools: definition.tools,
        maxTurns: call.maxTurns,
        maxBudgetUsd: call.maxBudgetUsd,
        outputFormat: { type: 'json_schema', schema: z.toJSONSchema(call.output) }
      }
    })) {
      if (message.type === 'result') result = message
    }

    const costUsd = result?.total_cost_usd ?? 0
    const outcome = result?.subtype ?? 'no result'
    await this.trace.record({
      stage: call.stage,
      role: call.role,
      agent: name,
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      costUsd,
      turns: result?.num_turns ?? 0,
      outcome
    })

    if (result?.subtype !== 'success') {
      const detail = result && 'errors' in result ? result.errors.join('; ') : ''
      return {
        ok: false,
        error: `${call.role} ended with ${outcome}${detail ? `: ${detail}` : ''}`,
        costUsd
      }
    }
    const parsed = call.output.safeParse(result.structured_output)
    if (!parsed.success) {
      return {
        ok: false,
        error: `${call.role} returned a summary that does not match its schema: ${parsed.error.message}`,
        costUsd
      }
    }
    this.log(`  ← ${call.role}: $${costUsd.toFixed(2)}, ${result.num_turns} turns`)
    return { ok: true, output: parsed.data, costUsd }
  }
}

// ── the summaries each stage asks for ───────────────────────────────────────────────────────

export const RequestDraftOutput = AgentStatusSchema.extend({
  draftPath: z.literal('.orchestrate/request-draft.md'),
  area: z.string(),
  inferredCriteria: z.number().int().min(0)
})

export const ScopeOutput = AgentStatusSchema.extend({
  planPath: z.string(),
  taskGraphPath: z.literal('.orchestrate/task-graph.json')
})

export const TestPlanOutput = AgentStatusSchema.extend({
  testPlanPath: z.string(),
  executionPlanPath: z.string(),
  deferred: z.array(z.object({ id: z.string(), reason: z.string() })),
  ambiguities: z.array(z.string())
})

export const FrameworkOutput = AgentStatusSchema.extend({
  changedFiles: z.array(z.string()),
  interfaces: z.array(z.string())
})

export const FrameworkRequestSchema = z.object({ need: z.string(), why: z.string() })

export const DeveloperOutput = AgentStatusSchema.extend({
  changedFiles: z.array(z.string()),
  cases: z.array(z.string()),
  frameworkRequests: z.array(FrameworkRequestSchema)
})

export const ReviewOutput = AgentStatusSchema.extend({
  findings: z.array(
    z.object({
      id: z.string(),
      severity: z.enum(['blocker', 'should-fix', 'nit']),
      owner: z.enum([
        'framework-architect',
        'test-developer-ui',
        'test-developer-api',
        'test-planner'
      ]),
      file: z.string(),
      line: z.number().int().optional(),
      message: z.string()
    })
  )
})

export const RepairOutput = AgentStatusSchema.extend({
  changedFiles: z.array(z.string()),
  resolved: z.array(z.string())
})
