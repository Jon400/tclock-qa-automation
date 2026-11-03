import type { Locator, Page } from '@playwright/test'
import { WebRoute } from '../../api/routes'
import { loginLabels } from '../labels/login.he'
import { reAuthDialogLabels, type ExpiryReason } from '../labels/re-auth-dialog.he'
import { Dialog } from './mui/dialog'

// Opens over the current page when the session expires (idle 15 min, absolute 5 h): the
// login form, embedded, with a notice that names the reason. Logging in again keeps the page.
export class ReAuthDialog {
  readonly dialog: Dialog
  readonly phoneInput: Locator
  readonly submitButton: Locator

  constructor(readonly page: Page) {
    this.dialog = Dialog.containing(page, page.getByLabel(loginLabels.phone))
    this.phoneInput = this.dialog.root.getByLabel(loginLabels.phone)
    this.submitButton = this.dialog.root.getByRole('button', {
      name: loginLabels.submit,
      exact: true
    })
  }

  get root(): Locator {
    return this.dialog.root
  }

  notice(reason: ExpiryReason): Locator {
    return this.dialog.root.getByText(reAuthDialogLabels.notice[reason])
  }

  // Needs the role's passkey in the page's virtual authenticator (see src/auth/).
  async reAuthenticate(phone: string): Promise<void> {
    await this.phoneInput.fill(phone)
    const response = this.page.waitForResponse(
      candidate => new URL(candidate.url()).pathname === WebRoute.authVerify
    )
    await this.submitButton.click()
    const verify = await response
    if (!verify.ok()) {
      throw new Error(
        `Re-authentication failed: ${WebRoute.authVerify} returned ${verify.status()}`
      )
    }
    await this.dialog.waitForClose()
  }
}
