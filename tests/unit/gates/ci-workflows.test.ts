import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { REPO_ROOT } from '../../../tools/gates/exec'

interface Step {
  name?: string
  uses?: string
  run?: string
  with?: Record<string, string>
}
interface Workflow {
  on: Record<string, unknown>
  permissions: Record<string, string>
  jobs: Record<string, { permissions?: Record<string, string>; steps: Step[] }>
}

const text = (file: string) =>
  readFileSync(path.join(REPO_ROOT, '.github', 'workflows', file), 'utf8')
const load = (file: string) => parse(text(file)) as Workflow
const steps = (workflow: Workflow) => Object.values(workflow.jobs).flatMap(job => job.steps)
const artifactPaths = (workflow: Workflow) =>
  steps(workflow)
    .filter(step => step.uses?.startsWith('actions/upload-artifact@'))
    .flatMap(step => (step.with?.path ?? '').split('\n'))
    .map(line => line.trim())
    .filter(Boolean)

describe('quality gate workflow', () => {
  const workflow = load('quality-gate.yml')

  it('holds no secrets and can only read the repository', () => {
    expect(text('quality-gate.yml')).not.toContain('secrets.')
    expect(workflow.permissions).toEqual({ contents: 'read' })
  })

  it('names a base the integrity check can find on a CI checkout', () => {
    const gate = steps(workflow).find(step => step.run?.startsWith('npm run gate'))

    expect(gate?.run).toContain('--base "origin/$BASE_REF"')
    expect(steps(workflow).find(step => step.uses?.startsWith('actions/checkout@'))?.with).toEqual(
      expect.objectContaining({ 'fetch-depth': 0 })
    )
  })
})

describe('live run workflow', () => {
  const workflow = load('live-run.yml')
  const names = steps(workflow).map(step => step.name)

  it('runs only on the schedule or on demand, so a branch cannot reach the passkeys', () => {
    expect(Object.keys(workflow.on).sort()).toEqual(['schedule', 'workflow_dispatch'])
    expect(workflow.permissions).toEqual({ contents: 'read' })
  })

  it('is off until the owner enables it', () => {
    expect(text('live-run.yml')).toContain("if: vars.LIVE_RUNS_ENABLED == 'true'")
  })

  it('publishes only JUnit and the Allure report', () => {
    expect(artifactPaths(workflow)).toEqual([
      '.orchestrate/runs/${{ env.RUN_ID }}/*/junit.xml',
      '.orchestrate/runs/${{ env.RUN_ID }}/allure-report/'
    ])
  })

  it('builds the report before it publishes', () => {
    expect(names.indexOf('Build the Allure report')).toBeGreaterThan(-1)
    expect(names.indexOf('Build the Allure report')).toBeLessThan(
      names.indexOf('Publish JUnit and the Allure report')
    )
  })

  it('sends only the built report to GitHub Pages', () => {
    const upload = steps(workflow).find(step =>
      step.uses?.startsWith('actions/upload-pages-artifact@')
    )

    expect(upload?.with?.path).toBe('.orchestrate/runs/${{ env.RUN_ID }}/allure-report/')
    expect(names.indexOf('Build the Allure report')).toBeLessThan(names.indexOf(upload?.name))
  })

  it('deploys to GitHub Pages from a job with no secrets', () => {
    const publish = workflow.jobs['publish-report']

    expect(publish?.permissions).toEqual({ pages: 'write', 'id-token': 'write' })
    expect(JSON.stringify(publish)).not.toContain('secrets.')
    expect(workflow.jobs['live-run']?.permissions).toBeUndefined()
  })

  it('never adds retries', () => {
    expect(text('live-run.yml')).not.toMatch(/--retries/)
  })
})
