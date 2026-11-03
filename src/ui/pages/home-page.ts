import type { Locator, Page } from '@playwright/test'
import { homeLabels } from '../labels/home.he'
import { TClockBasePage } from './tclock-base-page'

export class HomePage extends TClockBasePage {
  static readonly PATH = '/home'

  readonly welcomeHeading: Locator

  constructor(page: Page) {
    super(page)
    this.welcomeHeading = page.getByRole('heading', { level: 1, name: homeLabels.welcome })
  }

  async open(): Promise<this> {
    await this.goto(HomePage.PATH)
    await this.welcomeHeading.waitFor()
    return this
  }

  // Navigates without waiting for the page to render: for checking where an anonymous or
  // expired session ends up.
  async visit(): Promise<void> {
    await this.goto(HomePage.PATH)
  }
}
