import { loginWithPasskey } from '../../src/auth/passkey-login'
import { ROLES } from '../../src/config/enum'
import { storageStatePath } from '../../src/config/paths'
import { loadSettings, requirePhone } from '../../src/config/settings'
import { expect, test as setup } from '../fixtures'

// Logs every QA user in once per run, through the real login form and the role's passkey,
// and saves the session to .auth/<role>.json. Every other project reuses it, the way
// itac-arena's logged_in_* fixtures did once per test. The `settings` auto fixture has
// already validated the environment before this runs.
// Only roles with a phone in .env get a login: a QA user that is not provisioned yet must not
// fail the setup every other project depends on. Its cases fail on the missing session instead.
const configuredRoles = ROLES.filter(role => loadSettings().phones[role])

for (const role of configuredRoles) {
  setup(`log in as ${role}`, async ({ page, settings }) => {
    const home = await loginWithPasskey(page, role, requirePhone(settings, role))
    await expect(home.welcomeHeading).toBeVisible()

    await page.context().storageState({ path: storageStatePath(role) })
  })
}
