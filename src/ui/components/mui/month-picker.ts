import type { Locator } from '@playwright/test'
import { formatMonthYear } from '../../../utils/date-utils'
import { typeSectionDigits } from './date-picker'

// A MUI X month field (views month + year), filled the same way as DatePicker: digits in
// display order, month then year. Verify on the first screen that uses it.
export class MonthPicker {
  constructor(readonly root: Locator) {}

  // `month` is 1-12.
  async fill(year: number, month: number): Promise<void> {
    await typeSectionDigits(this.root, formatMonthYear(year, month))
  }

  async value(): Promise<string> {
    return this.root.inputValue()
  }
}
