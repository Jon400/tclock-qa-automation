// .plan/000-backlog.md: the queue. A request line starts with its area slug and links its
// issue once it is filed; any other line (framework work, CI) is not a loop request:
//   - [ ] auth: session expiry and the re-auth dialog | issue:#12
//   - [ ] QA framework foundation | plan:001

export interface BacklogItem {
  line: number
  title: string
  issue: number | undefined
}

const ITEM = /^- \[ \] (.+?)\s*$/
const ISSUE_LINK = /\|\s*issue:#(\d+)/
const AREA_PREFIX = /^[a-z][a-z0-9-]*:\s/

function currentQueue(markdown: string): { lines: string[]; start: number; end: number } {
  const lines = markdown.split(/\r?\n/)
  const start = lines.findIndex(line => /^current queue:?$/i.test(line.trim()))
  const from = start < 0 ? 0 : start + 1
  let end = lines.findIndex((line, index) => index > from && /^##\s/.test(line))
  if (end < 0) end = lines.length
  return { lines, start: from, end }
}

// The first unchecked request line of the current queue: one with an issue, or one that starts
// with an area slug. --next passes over everything else.
export function nextBacklogItem(markdown: string): BacklogItem | undefined {
  const { lines, start, end } = currentQueue(markdown)
  for (let index = start; index < end; index++) {
    const match = ITEM.exec(lines[index] ?? '')
    if (!match?.[1]) continue
    const issue = ISSUE_LINK.exec(match[1])?.[1]
    if (!issue && !AREA_PREFIX.test(match[1])) continue
    return {
      line: index + 1,
      title: match[1].replace(/\s*\|.*$/, '').trim(),
      issue: issue ? Number(issue) : undefined
    }
  }
  return undefined
}

// Adds the request filed at Gate 0 to the end of the current queue.
export function addBacklogLine(markdown: string, title: string, issue: number): string {
  const { lines, start, end } = currentQueue(markdown)
  let insertAt = start
  for (let index = start; index < end; index++) {
    if (/^- \[[ x]\] /.test(lines[index] ?? '')) insertAt = index + 1
  }
  lines.splice(insertAt, 0, `- [ ] ${title} | issue:#${issue}`)
  return lines.join('\n')
}

// Links the issue filed at Gate 0 to the backlog line a --next run started from.
export function linkBacklogLine(markdown: string, lineNumber: number, issue: number): string {
  const lines = markdown.split(/\r?\n/)
  const line = lines[lineNumber - 1]
  if (line === undefined || !ITEM.test(line) || ISSUE_LINK.test(line)) {
    throw new Error(`.plan/000-backlog.md:${lineNumber} is not an unchecked line without an issue`)
  }
  lines[lineNumber - 1] = `${line.trimEnd()} | issue:#${issue}`
  return lines.join('\n')
}
