import type { Locator, Page } from '@playwright/test'

// A MUI <Snackbar>. Its content carries role "alert", but so do other alerts on the page, so
// the stable MUI root class scopes it (allowed here, in mui/, per the locator rule).
export class Snackbar {
  readonly root: Locator

  constructor(page: Page) {
    this.root = page.locator('.MuiSnackbar-root')
  }

  message(text: string | RegExp): Locator {
    return this.root.filter({ hasText: text })
  }
}
