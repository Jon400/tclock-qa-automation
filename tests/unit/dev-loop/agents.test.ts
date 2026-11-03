import { describe, expect, it } from 'vitest'
import { AGENT_OF_ROLE, readAgentDefinition } from '../../../tools/dev-loop/agents'

const AGENTS = [...new Set(Object.values(AGENT_OF_ROLE))]

describe('agent definitions', () => {
  it.each(AGENTS)('%s parses, names itself and pins a model', async name => {
    const definition = await readAgentDefinition(name)

    expect(definition.name).toBe(name)
    expect(['opus', 'sonnet']).toContain(definition.model)
    expect(definition.tools).toEqual(expect.arrayContaining(['Read', 'Grep', 'Glob']))
  })

  it('gives no agent web access or a tool that runs arbitrary code in the browser', async () => {
    for (const name of AGENTS) {
      const { tools } = await readAgentDefinition(name)

      expect(
        tools.filter(tool =>
          /WebFetch|WebSearch|evaluate|run_code|file_upload|Task|Agent/.test(tool)
        )
      ).toEqual([])
    }
  })

  it('gives Playwright MCP only to the test planner, and only for the two QA roles', async () => {
    for (const name of AGENTS) {
      const mcp = (await readAgentDefinition(name)).tools.filter(tool => tool.startsWith('mcp__'))

      if (name !== 'test-planner') expect(mcp).toEqual([])
      else {
        expect(mcp.length).toBeGreaterThan(0)
        expect(mcp.every(tool => /^mcp__playwright-(operator|employee)__browser_/.test(tool))).toBe(
          true
        )
      }
    }
  })

  it('lets only the agents that must run checks use Bash', async () => {
    const withBash: string[] = []
    for (const name of AGENTS)
      if ((await readAgentDefinition(name)).tools.includes('Bash')) withBash.push(name)

    expect(withBash.sort()).toEqual(['code-reviewer', 'framework-architect', 'test-developer'])
  })
})
