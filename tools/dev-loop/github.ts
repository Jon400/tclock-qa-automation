import { z } from 'zod'
import { run, type ExecResult } from '../gates/exec'

// The single wrapper around the GitHub CLI. No other module calls `gh` or the GitHub API.
// - Reads ask for --json and parse it with zod.
// - Writes take --body-file (these commands have no --json) and parse the URL gh prints.
// - Under --dry-run every write is printed instead of run; reads still run.
// The credential lives in `gh auth login`, never in this repository. Agents never reach
// this module: only the driver does, and a hook blocks `gh` for every agent role.

export type GhRunner = (args: string[]) => ExecResult

export const defaultGhRunner: GhRunner = args => run('gh', args)

const IssueSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  body: z.string(),
  state: z.string(),
  url: z.string(),
  labels: z.array(z.object({ name: z.string() })).default([])
})
export type Issue = z.infer<typeof IssueSchema>

const IssueSummarySchema = z.array(z.object({ number: z.number().int(), title: z.string() }))
export type IssueSummary = z.infer<typeof IssueSummarySchema>[number]

const AuthStatusSchema = z.object({
  hosts: z.record(
    z.string(),
    z.array(
      z.object({ state: z.string(), active: z.boolean().optional(), login: z.string().optional() })
    )
  )
})

const ChecksSchema = z.array(
  z.object({ name: z.string(), state: z.string(), link: z.string().optional() })
)
export type PrCheck = z.infer<typeof ChecksSchema>[number]

const ISSUE_URL = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d+)(#issuecomment-\d+)?/
const PR_URL = /https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/

export class GhError extends Error {
  constructor(args: string[], result: ExecResult) {
    super(
      `gh ${args.join(' ')} failed (exit ${result.code}): ${(result.stderr || result.stdout).trim()}`
    )
    this.name = 'GhError'
  }
}

export interface Created {
  number: number
  url: string
}

export class GitHub {
  constructor(
    private readonly options: {
      dryRun: boolean
      run?: GhRunner
      log?: (line: string) => void
    }
  ) {}

  private get runner(): GhRunner {
    return this.options.run ?? defaultGhRunner
  }

  private log(line: string): void {
    ;(this.options.log ?? console.log)(line)
  }

  private read(args: string[]): string {
    const result = this.runner(args)
    if (result.code !== 0) throw new GhError(args, result)
    return result.stdout
  }

  private write(args: string[]): string | undefined {
    if (this.options.dryRun) {
      this.log(`  [dry-run] gh ${args.map(quote).join(' ')}`)
      return undefined
    }
    const result = this.runner(args)
    if (result.code !== 0) throw new GhError(args, result)
    return result.stdout
  }

  // ── reads ──────────────────────────────────────────────────────────────────────────────

  // The logged-in account on github.com, or undefined.
  authenticatedLogin(): string | undefined {
    const status = AuthStatusSchema.parse(
      JSON.parse(this.read(['auth', 'status', '--json', 'hosts']))
    )
    const accounts = status.hosts['github.com'] ?? []
    const active = accounts.find(account => account.state === 'success' && account.active !== false)
    return active?.login ?? (active ? 'unknown' : undefined)
  }

  viewIssue(number: number): Issue {
    return IssueSchema.parse(
      JSON.parse(
        this.read(['issue', 'view', String(number), '--json', 'number,title,body,state,url,labels'])
      )
    )
  }

  // Open bug issues whose title names this case ID: the duplicate check before filing.
  openBugsForCase(caseId: string): IssueSummary[] {
    const found = IssueSummarySchema.parse(
      JSON.parse(
        this.read([
          'issue',
          'list',
          '--label',
          'bug',
          '--state',
          'open',
          '--search',
          `${caseId} in:title`,
          '--json',
          'number,title'
        ])
      )
    )
    // The search is fuzzy; the title prefix is exact.
    return found.filter(issue => issue.title.startsWith(`[${caseId}]`))
  }

  prChecks(number: number): PrCheck[] {
    return ChecksSchema.parse(
      JSON.parse(this.read(['pr', 'checks', String(number), '--json', 'name,state,link']))
    )
  }

  // ── writes ─────────────────────────────────────────────────────────────────────────────

  createIssue(input: { title: string; bodyFile: string; labels: string[] }): Created {
    const out = this.write([
      'issue',
      'create',
      '--title',
      input.title,
      '--body-file',
      input.bodyFile,
      '--label',
      input.labels.join(',')
    ])
    return out === undefined ? dryRunCreated() : parseIssueUrl(out)
  }

  commentOnIssue(number: number, bodyFile: string): string {
    const out = this.write(['issue', 'comment', String(number), '--body-file', bodyFile])
    return out === undefined ? '(dry run)' : (ISSUE_URL.exec(out)?.[0] ?? out.trim())
  }

  ensureLabel(name: string, color: string, description: string): void {
    this.write(['label', 'create', name, '--color', color, '--description', description, '--force'])
  }

  createPullRequest(input: {
    title: string
    bodyFile: string
    base: string
    head: string
  }): Created {
    const out = this.write([
      'pr',
      'create',
      '--title',
      input.title,
      '--body-file',
      input.bodyFile,
      '--base',
      input.base,
      '--head',
      input.head
    ])
    if (out === undefined) return dryRunCreated()
    const match = PR_URL.exec(out)
    if (!match?.[1]) throw new Error(`gh pr create printed no pull request URL: ${out.trim()}`)
    return { number: Number(match[1]), url: match[0] }
  }

  // CI artifacts (JUnit, Allure) once GitHub Actions exists.
  downloadRunArtifacts(runId: string, directory: string): void {
    this.write(['run', 'download', runId, '--dir', directory])
  }
}

export function parseIssueUrl(output: string): Created {
  const match = ISSUE_URL.exec(output)
  if (!match?.[1]) throw new Error(`gh printed no issue URL: ${output.trim()}`)
  return { number: Number(match[1]), url: match[0] }
}

function dryRunCreated(): Created {
  return { number: 0, url: '(dry run)' }
}

function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, '\\$1')}"`
}
