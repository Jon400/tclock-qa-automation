import path from 'node:path'
import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'
import { Role, ROLES } from './enum'
import { REPO_ROOT } from './paths'

// The only environment this framework may ever touch. Not configurable on purpose: an env
// variable that widened it would be one an agent could set.
export const ALLOWED_HOSTS: readonly string[] = ['dev.tclock.co.il']
export const DEFAULT_BASE_URL = 'https://dev.tclock.co.il'

export class SettingsError extends Error {
  constructor(issues: string[]) {
    super(
      `Invalid settings (.env / environment):\n${issues.map(issue => `  - ${issue}`).join('\n')}`
    )
    this.name = 'SettingsError'
  }
}

export function isAllowedBaseUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  return (
    url.protocol === 'https:' &&
    ALLOWED_HOSTS.includes(url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === ''
  )
}

const booleanText = z
  .enum(['true', 'false', '1', '0'])
  .transform(value => value === 'true' || value === '1')

// TClock's login form accepts 9-10 digits.
const phone = z.string().regex(/^\d{9,10}$/, 'must be 9 or 10 digits')

const EnvSchema = z.object({
  BASE_URL: z
    .string()
    .default(DEFAULT_BASE_URL)
    .refine(isAllowedBaseUrl, {
      message: `must be an https URL on an allowed host (${ALLOWED_HOSTS.join(', ')})`
    }),
  HEADLESS: booleanText.default(true),
  ACTION_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  NAVIGATION_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  QA_OPERATOR_PHONE: phone.optional(),
  QA_EMPLOYEE_PHONE: phone.optional(),
  RUN_ID: z
    .string()
    .regex(/^\d{6}-\d{6}-[0-9a-f]{4}$/, 'must look like YYMMDD-HHMMSS-xxxx')
    .optional(),
  RUN_STEP: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, 'must be a lowercase slug')
    .default('run')
})

export interface Settings {
  baseUrl: string
  headless: boolean
  actionTimeoutMs: number
  navigationTimeoutMs: number
  phones: Partial<Record<Role, string>>
  runId: string | undefined
  runStep: string
}

// Validates an environment. Pure: no file access, so it is easy to unit test.
export function parseSettings(env: Record<string, string | undefined>): Settings {
  // An empty value in .env (`QA_OPERATOR_PHONE=`) means "not set".
  const present = Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined && value !== '')
  )
  const result = EnvSchema.safeParse(present)
  if (!result.success) {
    throw new SettingsError(
      result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`)
    )
  }
  const values = result.data
  return {
    baseUrl: values.BASE_URL.replace(/\/+$/, ''),
    headless: values.HEADLESS,
    actionTimeoutMs: values.ACTION_TIMEOUT_MS,
    navigationTimeoutMs: values.NAVIGATION_TIMEOUT_MS,
    phones: {
      ...(values.QA_OPERATOR_PHONE ? { [Role.operator]: values.QA_OPERATOR_PHONE } : {}),
      ...(values.QA_EMPLOYEE_PHONE ? { [Role.employee]: values.QA_EMPLOYEE_PHONE } : {})
    },
    runId: values.RUN_ID,
    runStep: values.RUN_STEP
  }
}

let cached: Settings | undefined

// Loads .env from the repository root (when it exists) and validates process.env.
// Memoised per process. A missing .env is fine: every variable has a default or is optional.
export function loadSettings(): Settings {
  if (!cached) {
    loadDotenv({ path: path.join(REPO_ROOT, '.env'), quiet: true })
    cached = parseSettings(process.env)
  }
  return cached
}

// The phone number of a QA user. Only login needs it, so only login asks for it.
export function requirePhone(settings: Settings, role: Role): string {
  const value = settings.phones[role]
  if (!value) {
    const variable = role === Role.operator ? 'QA_OPERATOR_PHONE' : 'QA_EMPLOYEE_PHONE'
    throw new SettingsError([`${variable}: required to log in as ${role}. Set it in .env.`])
  }
  return value
}

export function parseRole(value: string | undefined): Role {
  const role = ROLES.find(candidate => candidate === value)
  if (!role) {
    throw new SettingsError([`role: expected one of ${ROLES.join(', ')}, got "${value ?? ''}"`])
  }
  return role
}
