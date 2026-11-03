import { describe, expect, it } from 'vitest'
import { Role } from '../../../src/config/enum'
import {
  DEFAULT_BASE_URL,
  isAllowedBaseUrl,
  parseRole,
  parseSettings,
  requirePhone,
  SettingsError
} from '../../../src/config/settings'

describe('settings', () => {
  it('works with an empty environment: every value has a default or is optional', () => {
    const settings = parseSettings({})

    expect(settings.baseUrl).toBe(DEFAULT_BASE_URL)
    expect(settings.headless).toBe(true)
    expect(settings.phones).toEqual({})
    expect(settings.runStep).toBe('run')
  })

  it.each([
    ['production apex', 'https://tclock.co.il'],
    ['www', 'https://www.tclock.co.il'],
    ['another subdomain', 'https://app.tclock.co.il'],
    ['plain http', 'http://dev.tclock.co.il'],
    ['another host', 'https://example.com'],
    ['a look-alike host', 'https://dev.tclock.co.il.evil.example'],
    ['an explicit port', 'https://dev.tclock.co.il:8443'],
    ['a user name in the URL', 'https://someone@dev.tclock.co.il'],
    ['not a URL', 'dev.tclock.co.il']
  ])('rejects a BASE_URL on %s', (_name, baseUrl) => {
    expect(isAllowedBaseUrl(baseUrl)).toBe(false)
    expect(() => parseSettings({ BASE_URL: baseUrl })).toThrow(SettingsError)
  })

  it('accepts the dev host and drops a trailing slash', () => {
    expect(parseSettings({ BASE_URL: 'https://dev.tclock.co.il/' }).baseUrl).toBe(
      'https://dev.tclock.co.il'
    )
  })

  it('names the variable in the error', () => {
    expect(() => parseSettings({ BASE_URL: 'https://tclock.co.il' })).toThrow(/BASE_URL/)
  })

  it('treats an empty value as not set', () => {
    expect(parseSettings({ QA_OPERATOR_PHONE: '' }).phones).toEqual({})
  })

  // Landline-style fakes: mobile-looking numbers would (rightly) fail the secretlint gate.
  it('maps phone variables to roles', () => {
    const settings = parseSettings({
      QA_OPERATOR_PHONE: '0300000001',
      QA_EMPLOYEE_PHONE: '300000002'
    })

    expect(requirePhone(settings, Role.operator)).toBe('0300000001')
    expect(requirePhone(settings, Role.employee)).toBe('300000002')
  })

  it.each(['030-0000001', '12345678', '03000000011', 'abcdefghij'])(
    'rejects the phone %s',
    phone => {
      expect(() => parseSettings({ QA_OPERATOR_PHONE: phone })).toThrow(/QA_OPERATOR_PHONE/)
    }
  )

  it('asks for the phone only when a login needs it', () => {
    expect(() => requirePhone(parseSettings({}), Role.employee)).toThrow(/QA_EMPLOYEE_PHONE/)
  })

  it('validates timeouts, booleans and the run id', () => {
    expect(parseSettings({ HEADLESS: 'false', ACTION_TIMEOUT_MS: '5000' })).toMatchObject({
      headless: false,
      actionTimeoutMs: 5000
    })
    expect(() => parseSettings({ HEADLESS: 'maybe' })).toThrow(/HEADLESS/)
    expect(() => parseSettings({ ACTION_TIMEOUT_MS: '-1' })).toThrow(/ACTION_TIMEOUT_MS/)
    expect(() => parseSettings({ RUN_ID: 'today' })).toThrow(/RUN_ID/)
  })

  it('parses a role name', () => {
    expect(parseRole('employee')).toBe(Role.employee)
    expect(() => parseRole('admin')).toThrow(SettingsError)
    expect(() => parseRole(undefined)).toThrow(SettingsError)
  })
})
