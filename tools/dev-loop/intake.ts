import { z } from 'zod'

// Every run starts from a test request in the `test-request` issue template: fixed headings,
// numbered acceptance criteria. This parser reads an issue body, an orchestrator draft, or
// a local fixture, and produces .orchestrate/request.json.

export const SECTION = {
  userStory: 'User story',
  acceptanceCriteria: 'Acceptance criteria',
  area: 'Area',
  roles: 'Roles involved',
  outOfScope: 'Out of scope',
  links: 'Links'
} as const

export const INFERRED_MARK = '(inferred)'

export const CriterionSchema = z.object({
  number: z.number().int().positive(),
  text: z.string().min(1),
  inferred: z.boolean()
})

export const RequestSchema = z.object({
  issue: z.number().int().positive().nullable(),
  url: z.string().nullable(),
  title: z.string().min(1),
  area: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'the area must be a kebab-case slug, e.g. employee-report'),
  roles: z.array(z.string().min(1)).min(1, 'name at least one role'),
  userStory: z.string().min(1, 'the user story is empty'),
  acceptanceCriteria: z
    .array(CriterionSchema)
    .min(1, 'at least one numbered acceptance criterion is required'),
  outOfScope: z.array(z.string()),
  links: z.array(z.string())
})
export type TestRequest = z.infer<typeof RequestSchema>

export class RequestError extends Error {
  constructor(readonly problems: string[]) {
    super(`Not a valid test request:\n${problems.map(problem => `  - ${problem}`).join('\n')}`)
    this.name = 'RequestError'
  }
}

// `## <heading>` sections of a Markdown body. HTML comments (template hints) are dropped.
export function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>()
  const clean = markdown.replace(/<!--[\s\S]*?-->/g, '')
  const pattern = /^##\s+(.+?)\s*$/gm
  const headings = [...clean.matchAll(pattern)]
  headings.forEach((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = headings[index + 1]?.index ?? clean.length
    result.set((match[1] ?? '').toLowerCase(), clean.slice(start, end).trim())
  })
  return result
}

const listItems = (text: string) =>
  text
    .split(/\r?\n/)
    .map(line => /^\s*[-*]\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((item): item is string => Boolean(item) && !/^_?none_?\.?$/i.test(item ?? ''))

export interface ParseOptions {
  issue?: number | null
  url?: string | null
  title?: string
  // After Gate 0 the owner has confirmed or deleted every inferred criterion.
  allowInferred: boolean
}

export function parseTestRequest(markdown: string, options: ParseOptions): TestRequest {
  const parts = sections(markdown)
  const problems: string[] = []
  const section = (name: string) => {
    const value = parts.get(name.toLowerCase())
    if (value === undefined) problems.push(`missing the "## ${name}" section`)
    return value ?? ''
  }

  const title = options.title ?? /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? ''
  if (!title) problems.push('missing a title (a "# <title>" line, or the issue title)')

  const criteria = section(SECTION.acceptanceCriteria)
    .split(/\r?\n/)
    .map(line => /^\s*(\d+)[.)]\s+(.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map(match => {
      const text = (match[2] ?? '').trim()
      return {
        number: Number(match[1]),
        text: text.replace(INFERRED_MARK, '').trim(),
        inferred: text.includes(INFERRED_MARK)
      }
    })
  criteria.forEach((criterion, index) => {
    if (criterion.number !== index + 1)
      problems.push(
        `acceptance criteria must be numbered 1, 2, 3...; found ${criterion.number} at position ${index + 1}`
      )
  })
  const inferred = criteria.filter(criterion => criterion.inferred)
  if (inferred.length && !options.allowInferred) {
    problems.push(
      `criteria ${inferred.map(criterion => criterion.number).join(', ')} are still marked ${INFERRED_MARK}: confirm or delete each one`
    )
  }

  const area = section(SECTION.area)
    .replace(/[`*_]/g, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean)

  const candidate = {
    issue: options.issue ?? null,
    url: options.url ?? null,
    title,
    area: area ?? '',
    roles: listItems(section(SECTION.roles)).map(role => role.replace(/[`*_]/g, '').toLowerCase()),
    userStory: section(SECTION.userStory),
    acceptanceCriteria: criteria,
    outOfScope: listItems(parts.get(SECTION.outOfScope.toLowerCase()) ?? ''),
    links: listItems(parts.get(SECTION.links.toLowerCase()) ?? '')
  }
  const result = RequestSchema.safeParse(candidate)
  if (!result.success) {
    problems.push(
      ...result.error.issues.map(issue => `${issue.path.join('.') || 'request'}: ${issue.message}`)
    )
  }
  if (problems.length || !result.success) throw new RequestError([...new Set(problems)])
  return result.data
}

// The requirement ID a request criterion gets once the test planner adopts it is assigned
// in the area's test plan; until then a criterion is identified by its number.
export function criterionLabel(request: TestRequest, number: number): string {
  return `#${request.issue ?? 'local'} AC ${number}`
}
