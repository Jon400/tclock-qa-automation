import { describe, expect, it } from 'vitest'
import {
  deserializePasskey,
  serializePasskey,
  type PasskeyCredential
} from '../../../src/auth/passkey-store'
import { Role } from '../../../src/config/enum'

// A made-up credential: these values are not a real key.
const credential: PasskeyCredential = {
  credentialId: 'Y3JlZGVudGlhbC1pZA',
  isResidentCredential: true,
  rpId: 'dev.tclock.co.il',
  privateKey: 'not-a-real-key',
  userHandle: 'dXNlci1oYW5kbGU',
  signCount: 7
}

describe('passkey (de)serialisation', () => {
  it('round-trips a credential with its role and save time', () => {
    const text = serializePasskey(Role.operator, credential, new Date('2026-10-16T10:00:00Z'))

    expect(JSON.parse(text)).toMatchObject({
      version: 1,
      role: 'operator',
      savedAt: '2026-10-16T10:00:00.000Z'
    })
    expect(deserializePasskey(Role.operator, text)).toEqual(credential)
  })

  it('keeps the signature counter, so the next login signs with a higher one', () => {
    const text = serializePasskey(Role.employee, { ...credential, signCount: 42 })

    expect(deserializePasskey(Role.employee, text).signCount).toBe(42)
  })

  it('refuses a file saved for another role', () => {
    const text = serializePasskey(Role.operator, credential)

    expect(() => deserializePasskey(Role.employee, text)).toThrow(/belongs to "operator"/)
  })

  it('refuses a credential without its private key', () => {
    const { privateKey: _privateKey, ...withoutKey } = credential

    expect(() => serializePasskey(Role.operator, withoutKey as PasskeyCredential)).toThrow()
  })

  it('refuses an unknown file version', () => {
    const text = serializePasskey(Role.operator, credential).replace('"version": 1', '"version": 2')

    expect(() => deserializePasskey(Role.operator, text)).toThrow()
  })
})
