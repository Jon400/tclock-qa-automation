import type { Page, Response } from '@playwright/test'

// Generic base for every page object. Nothing TClock-specific belongs here: product-wide
// pieces (navbar, logout, re-auth dialog) live in pages/tclock-base-page.ts.
export abstract class BasePage {
  constructor(readonly page: Page) {}

  protected async goto(path: string): Promise<void> {
    await this.page.goto(path)
  }

  // Runs an action and returns the API response it triggers. The wait starts before the
  // action, so a fast response is never missed. Use it instead of any sleep.
  async waitForApi(
    pathPart: string | RegExp,
    action: () => Promise<void>,
    options: { method?: string } = {}
  ): Promise<Response> {
    const response = this.page.waitForResponse(candidate => {
      const pathname = new URL(candidate.url()).pathname
      const matchesPath =
        typeof pathPart === 'string' ? pathname === pathPart : pathPart.test(pathname)
      const matchesMethod = !options.method || candidate.request().method() === options.method
      return matchesPath && matchesMethod
    })
    await action()
    return response
  }

  async reload(): Promise<void> {
    await this.page.reload()
  }

  pathname(): string {
    return new URL(this.page.url()).pathname
  }
}
