import type { Locator, Page } from '@playwright/test'
import { WebRoute } from '../../api/routes'
import { navbarLabels, type NavbarMenu } from '../labels/navbar.he'

// The TClock app bar: management menus (role-dependent), preferences, logout.
export class Navbar {
  readonly mainNavigation: Locator
  readonly logoutButton: Locator

  constructor(readonly page: Page) {
    this.mainNavigation = page.getByRole('navigation', { name: navbarLabels.mainNavigation })
    // The navbar renders a desktop and a mobile logout button; only one is visible.
    this.logoutButton = page
      .getByRole('button', { name: navbarLabels.logout, exact: true })
      .filter({ visible: true })
  }

  // A root menu button, e.g. menu('company'). Hidden for roles that may not use it.
  menu(name: NavbarMenu): Locator {
    return this.mainNavigation.getByRole('button', { name: navbarLabels.menu[name], exact: true })
  }

  // Logs out and waits until the server has ended the session.
  async logout(): Promise<void> {
    const response = this.page.waitForResponse(
      candidate =>
        new URL(candidate.url()).pathname === WebRoute.authLogout &&
        candidate.request().method() === 'POST'
    )
    await this.logoutButton.click()
    await response
  }
}
