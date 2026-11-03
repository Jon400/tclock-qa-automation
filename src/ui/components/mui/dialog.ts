import type { Locator, Page } from '@playwright/test'

// A MUI <Dialog>: role "dialog", named by its <DialogTitle> when it has one.
export class Dialog {
  constructor(readonly root: Locator) {}

  static byName(page: Page, name: string | RegExp): Dialog {
    return new Dialog(page.getByRole('dialog', { name }))
  }

  // For a dialog without a title: the one that contains a known element.
  static containing(page: Page, inner: Locator): Dialog {
    return new Dialog(page.getByRole('dialog').filter({ has: inner }))
  }

  get title(): Locator {
    return this.root.getByRole('heading').first()
  }

  button(name: string | RegExp): Locator {
    return this.root.getByRole('button', { name, exact: typeof name === 'string' })
  }

  async waitForOpen(): Promise<void> {
    await this.root.waitFor({ state: 'visible' })
  }

  async waitForClose(): Promise<void> {
    await this.root.waitFor({ state: 'hidden' })
  }
}
