import type { Locator } from '@playwright/test'
import { formatDayMonthYear } from '../../../utils/date-utils'

// A MUI X date field. MUI X splits the value into sections (day / month / year) that accept
// typed digits and move to the next section on their own, so typing the digits in display
// order works for both the sectioned and the single-input DOM. Locate `root` by the field's
// label in the page object. Verify on the first screen that uses it.
export class DatePicker {
  constructor(readonly root: Locator) {}

  async fill(date: Date): Promise<void> {
    await typeSectionDigits(this.root, formatDayMonthYear(date))
  }

  async value(): Promise<string> {
    return this.root.inputValue()
  }
}

export async function typeSectionDigits(field: Locator, displayValue: string): Promise<void> {
  await field.click()
  await field.press('ControlOrMeta+a')
  await field.pressSequentially(displayValue.replace(/\D/g, ''))
}
