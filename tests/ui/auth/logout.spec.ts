import { SessionClient } from '../../../src/api/clients/session-client'
import { HomePage } from '../../../src/ui/pages/home-page'
import { LoginPage } from '../../../src/ui/pages/login-page'
import { expect, test, testCase } from '../../fixtures'

test(
  'logout ends the session in the browser and on the server',
  testCase('AUTH-UI-003', '@smoke'),
  async ({ freshOperatorPage }) => {
    const home = await new HomePage(freshOperatorPage).open()

    await home.logout()
    await new HomePage(freshOperatorPage).visit()

    await expect(new LoginPage(freshOperatorPage).phoneInput).toBeVisible()
    // The same cookies no longer open a session: the server ended it, not just the UI.
    const sessionAfterLogout = await new SessionClient(freshOperatorPage.request).requestSession(
      401
    )
    await expect(sessionAfterLogout).toBeAccessDenied()
  }
)
