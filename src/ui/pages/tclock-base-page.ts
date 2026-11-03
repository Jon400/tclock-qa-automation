import type { Page } from '@playwright/test'
import { BasePage } from '../base-page'
import { Navbar } from '../components/navbar'
import { ReAuthDialog } from '../components/re-auth-dialog'

// What every TClock screen shares: the navbar and the re-auth dialog. Every TClock page
// object extends this (itac-arena's ItacArenaBasePage).
export abstract class TClockBasePage extends BasePage {
  readonly navbar: Navbar
  readonly reAuthDialog: ReAuthDialog

  constructor(page: Page) {
    super(page)
    this.navbar = new Navbar(page)
    this.reAuthDialog = new ReAuthDialog(page)
  }

  // Ends the session from the navbar. A protected page then redirects to /login.
  async logout(): Promise<void> {
    await this.navbar.logout()
    await this.page.waitForURL(url => url.pathname === '/login' || url.pathname === '/')
  }
}
