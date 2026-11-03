import ExcelJS from 'exceljs'
import type { Download } from '@playwright/test'

export type SheetRow = Record<string, string | number | boolean | null>

// Reads one worksheet into objects keyed by the header row (row 1). For asserting on
// downloaded reports: parse the file, then assert on the rows.
export async function readSheet(
  source: Buffer | string,
  sheet: number | string = 1
): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook()
  if (typeof source === 'string') {
    await workbook.xlsx.readFile(source)
  } else {
    await workbook.xlsx.load(source as unknown as ArrayBuffer)
  }
  const worksheet =
    typeof sheet === 'number' ? workbook.worksheets[sheet - 1] : workbook.getWorksheet(sheet)
  if (!worksheet) {
    throw new Error(`Worksheet ${sheet} not found`)
  }

  const headers: string[] = []
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
    headers[column - 1] = cellText(cell.value)
  })

  const rows: SheetRow[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const record: SheetRow = {}
    headers.forEach((header, index) => {
      record[header || `column${index + 1}`] = cellValue(row.getCell(index + 1).value)
    })
    rows.push(record)
  })
  return rows
}

// A Playwright download, read straight into rows.
export async function readDownloadedSheet(
  download: Download,
  sheet: number | string = 1
): Promise<SheetRow[]> {
  const filePath = await download.path()
  return readSheet(filePath, sheet)
}

function cellValue(value: ExcelJS.CellValue): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value
  if (value instanceof Date) return value.toISOString()
  return cellText(value)
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value !== 'object') return String(value)
  if ('richText' in value) return value.richText.map(part => part.text).join('')
  if ('result' in value) return cellText(value.result)
  if ('text' in value) return String(value.text)
  if ('error' in value) return String(value.error)
  return ''
}
