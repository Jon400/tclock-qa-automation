import type { Page } from '@playwright/test'
import { z } from 'zod'
import type { Role } from '../config/enum'
import type { HomePage } from '../ui/pages/home-page'
import { LoginPage } from '../ui/pages/login-page'
import { loadPasskey, savePasskey, withPasskeyLock, type PasskeyCredential } from './passkey-store'
import { VirtualAuthenticator } from './virtual-authenticator'

const StartResponseSchema = z.object({ next: z.enum(['enroll', 'login']) })

// Logs a QA user in through the real login form, signing with the role's stored passkey.
// The page ends on /home with a live session in its context.
export async function loginWithPasskey(page: Page, role: Role, phone: string): Promise<HomePage> {
  return withPasskeyLock(role, async () => {
    const credential = await loadPasskey(role)
    const authenticator = await VirtualAuthenticator.attach(page)
    await authenticator.addCredential(credential)

    const loginPage = await new LoginPage(page).open()
    const home = await loginPage.loginWithPasskey(phone)

    // Keep the signCount the server last saw.
    await savePasskey(role, await authenticator.credential(credential.credentialId))
    return home
  })
}

// First login of a freshly provisioned QA user: /web/auth/start answers `enroll`, the app
// asks the browser to create a passkey, and the virtual authenticator makes one. The new
// credential is saved to .auth/passkey.<role>.json. Run once per user, by the owner
// (npm run auth:enroll).
export async function enrollPasskey(
  page: Page,
  role: Role,
  phone: string
): Promise<PasskeyCredential> {
  return withPasskeyLock(role, async () => {
    const authenticator = await VirtualAuthenticator.attach(page)
    const loginPage = await new LoginPage(page).open()
    const { start, verify } = await loginPage.submitPhone(phone)

    const { next } = StartResponseSchema.parse(await start.json())
    if (next !== 'enroll') {
      throw new Error(
        `TClock answered "${next}", not "enroll": this user already has a passkey. ` +
          'Reset its registration in the operator UI first.'
      )
    }
    if (!verify.ok()) {
      throw new Error(`Enrollment failed: /web/auth/verify returned ${verify.status()}`)
    }

    const [credential] = await authenticator.credentials()
    if (!credential) {
      throw new Error('Enrollment finished but the virtual authenticator holds no credential')
    }
    await savePasskey(role, credential)
    return credential
  })
}
