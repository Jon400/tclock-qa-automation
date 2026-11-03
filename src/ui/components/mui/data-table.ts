import type { Locator, Page } from '@playwright/test'

// A MUI <Table> (or any ARIA table): header cells are "columnheader", body cells are "cell".
export class DataTable {
  constructor(readonly root: Locator) {}

  static first(scope: Page | Locator): DataTable {
    return new DataTable(scope.getByRole('table').first())
  }

  get headers(): Locator {
    return this.root.getByRole('columnheader')
  }

  // Body rows only: rows that contain data cells rather than header cells.
  get rows(): Locator {
    return this.root.getByRole('row').filter({ has: this.root.page().getByRole('cell') })
  }

  row(text: string | RegExp): Locator {
    return this.rows.filter({ hasText: text })
  }

  async columnIndex(name: string): Promise<number> {
    const names = (await this.headers.allTextContents()).map(header => header.trim())
    const index = names.indexOf(name)
    if (index < 0) {
      throw new Error(`Column "${name}" not found. Columns: ${names.join(' | ')}`)
    }
    return index
  }

  async cell(rowText: string | RegExp, columnName: string): Promise<Locator> {
    const index = await this.columnIndex(columnName)
    return this.row(rowText).getByRole('cell').nth(index)
  }
}
