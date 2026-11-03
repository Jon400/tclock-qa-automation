// A minimal GitHub-flavoured Markdown table reader: enough for the fixed tables in
// .test/ files, with line numbers so every finding points at the row that caused it.

export interface TableRow {
  line: number
  cells: Record<string, string>
}

export interface Table {
  headers: string[]
  rows: TableRow[]
  line: number
}

export function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index]
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|'
      index++
    } else if (char === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

// The first table after a `## <heading>` line (any heading level), or undefined when the
// heading or its table is missing. Stops at the next heading.
export function tableAfterHeading(markdown: string, heading: string): Table | undefined {
  const lines = markdown.split(/\r?\n/)
  const headingPattern = new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\s*$`, 'i')
  const start = lines.findIndex(line => headingPattern.test(line.trim()))
  if (start < 0) return undefined

  let index = start + 1
  while (index < lines.length && !lines[index]?.trim().startsWith('|')) {
    if (/^#{1,6}\s/.test(lines[index]?.trim() ?? '')) return undefined
    index++
  }
  if (index >= lines.length) return undefined

  const headerLine = index
  const headers = splitRow(lines[index] ?? '')
  index += 2 // header + separator
  const rows: TableRow[] = []
  while (index < lines.length && lines[index]?.trim().startsWith('|')) {
    const values = splitRow(lines[index] ?? '')
    const cells: Record<string, string> = {}
    headers.forEach((header, column) => {
      cells[header] = values[column] ?? ''
    })
    rows.push({ line: index + 1, cells })
    index++
  }
  return { headers, rows, line: headerLine + 1 }
}

// `Key: value` metadata lines near the top of a document (before the first table).
export function readMetadata(markdown: string, key: string): string | undefined {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, 'im')
  return pattern.exec(markdown)?.[1]?.trim()
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
