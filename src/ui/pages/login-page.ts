import type { Locator, Page, Response } from '@playwright/test'
import { WebRoute } from '../../api/routes'
import { loginLabels } from '../labels/login.he'
import { HomePage } from './home-page'
import { TClockBasePage } from './tclock-base-page'

export interface PasskeySubmission {
  start: Response
  verify: Response
}

// Phone + passkey login. /web/auth/start answers `enroll` (first login: the browser creates
// a passkey) or `login` (the browser signs with the existing one); /web/auth/verify opens
// the session. There is no OTP or SMS step.
export class LoginPage extends TClockBasePage {
  static readonly PATH = '/login'

  readonly title: Locator
  readonly phoneInput: Locator
  readonly submitButton: Locator
  readonly errorAlert: Locator

  constructor(page: Page) {
    super(page)
    this.title = page.getByRole('heading', { name: loginLabels.title })
    this.phoneInput = page.getByLabel(loginLabels.phone)
    this.submitButton = page.getByRole('button', { name: loginLabels.submit, exact: true })
    this.errorAlert = page.getByRole('alert')
  }

  async open(): Promise<this> {
    await this.goto(LoginPage.PATH)
    await this.phoneInput.waitFor()
    return this
  }

  // Submits the phone number and returns both auth calls. The passkey ceremony in between
  // needs a virtual authenticator on the page (src/auth/).
  async submitPhone(phone: string): Promise<PasskeySubmission> {
    await this.phoneInput.fill(phone)
    const startResponse = this.page.waitForResponse(
      candidate => pathOf(candidate) === WebRoute.authStart
    )
    const verifyResponse = this.page.waitForResponse(
      candidate => pathOf(candidate) === WebRoute.authVerify
    )
    // If start fails, verify never comes: keep its rejection from going unhandled.
    verifyResponse.catch(() => undefined)
    await this.submitButton.click()

    const start = await startResponse
    if (!start.ok()) {
      throw new Error(`Passkey login failed: ${WebRoute.authStart} returned ${start.status()}`)
    }
    return { start, verify: await verifyResponse }
  }

  async loginWithPasskey(phone: string): Promise<HomePage> {
    const { verify } = await this.submitPhone(phone)
    if (!verify.ok()) {
      throw new Error(`Passkey login failed: ${WebRoute.authVerify} returned ${verify.status()}`)
    }
    await this.page.waitForURL(url => url.pathname === HomePage.PATH)
    return new HomePage(this.page)
  }
}

function pathOf(response: Response): string {
  return new URL(response.url()).pathname
}
