import type { CDPSession, Page } from '@playwright/test'
import { PasskeyCredentialSchema, type PasskeyCredential } from './passkey-store'

// A platform authenticator with resident keys and user verification, which is what a
// phone or laptop passkey looks like to TClock. Presence and verification are automatic.
export const AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true
} as const

// Chromium's CDP WebAuthn virtual authenticator, attached to one page. It answers the
// app's navigator.credentials.create()/get() calls with no UI.
export class VirtualAuthenticator {
  private constructor(
    private readonly cdp: CDPSession,
    readonly authenticatorId: string
  ) {}

  static async attach(page: Page): Promise<VirtualAuthenticator> {
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('WebAuthn.enable', { enableUI: false })
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { ...AUTHENTICATOR_OPTIONS }
    })
    return new VirtualAuthenticator(cdp, authenticatorId)
  }

  async addCredential(credential: PasskeyCredential): Promise<void> {
    await this.cdp.send('WebAuthn.addCredential', {
      authenticatorId: this.authenticatorId,
      credential
    })
  }

  async credentials(): Promise<PasskeyCredential[]> {
    const { credentials } = await this.cdp.send('WebAuthn.getCredentials', {
      authenticatorId: this.authenticatorId
    })
    return PasskeyCredentialSchema.array().parse(credentials)
  }

  async credential(credentialId: string): Promise<PasskeyCredential> {
    const match = (await this.credentials()).find(
      candidate => candidate.credentialId === credentialId
    )
    if (!match) {
      throw new Error('The virtual authenticator lost the credential it was given')
    }
    return match
  }

  async detach(): Promise<void> {
    await this.cdp.send('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: this.authenticatorId
    })
    await this.cdp.detach()
  }
}
