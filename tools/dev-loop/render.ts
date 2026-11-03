// Fills a Markdown template that has fixed `## ` headings: GitHub's issue and PR templates.
// The driver writes the evidence; no agent writes a bug report body or a PR body.

export function stripFrontMatter(template: string): string {
  return template.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
}

export function stripComments(markdown: string): string {
  return markdown.replace(/<!--[\s\S]*?-->\r?\n?/g, '')
}

export function templateHeadings(template: string): string[] {
  return [...stripFrontMatter(template).matchAll(/^##\s+(.+?)\s*$/gm)].map(match => match[1] ?? '')
}

// Rebuilds the body heading by heading from `content`. A heading without content keeps a
// "—" so the layout stays recognisable; content for an unknown heading is an error.
export function fillTemplate(template: string, content: Record<string, string>): string {
  const headings = templateHeadings(template)
  const unknown = Object.keys(content).filter(key => !headings.includes(key))
  if (unknown.length) {
    throw new Error(`The template has no heading(s): ${unknown.join(', ')}`)
  }
  return `${headings.map(heading => `## ${heading}\n\n${content[heading]?.trim() || '—'}\n`).join('\n')}`
}

export function markdownTable(headers: string[], rows: string[][]): string {
  const escape = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>')
  return [
    `| ${headers.join(' | ')} |`,
    `|${headers.map(() => '---').join('|')}|`,
    ...rows.map(row => `| ${row.map(escape).join(' | ')} |`)
  ].join('\n')
}
