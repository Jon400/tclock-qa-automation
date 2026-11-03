// `as const` objects plus union types instead of TypeScript `enum`: the values stay plain
// strings at runtime, which keeps JSON, tags and file names readable.

// Chromium only: the passkey login relies on the CDP WebAuthn virtual authenticator.
export const BrowserType = {
  chromium: 'chromium'
} as const
export type BrowserType = (typeof BrowserType)[keyof typeof BrowserType]

// The QA users the framework logs in as. Each one maps to a SUT role (see SUT_ROLE_OF).
export const Role = {
  operator: 'operator',
  employee: 'employee'
} as const
export type Role = (typeof Role)[keyof typeof Role]
export const ROLES: readonly Role[] = Object.values(Role)

// Role values exactly as TClock serves them in `user.db_role`.
export const SutRole = {
  admin: 'admin',
  operator: 'operator',
  user: 'user'
} as const
export type SutRole = (typeof SutRole)[keyof typeof SutRole]

export const SUT_ROLE_OF: Record<Role, SutRole> = {
  operator: SutRole.operator,
  employee: SutRole.user
}

// `user.access_mode` as TClock serves it.
export const AccessMode = {
  full: 'full',
  reportsOnly: 'reports_only'
} as const
export type AccessMode = (typeof AccessMode)[keyof typeof AccessMode]

// Test areas. The slug names the test folder, the .test/ folder, the @tag and the branch.
export const Area = {
  auth: 'auth',
  employeeReport: 'employee-report',
  payrollHours: 'payroll-hours',
  user: 'user',
  branch: 'branch',
  workReportLocation: 'work-report-location',
  absence: 'absence',
  companyPolicy: 'company-policy',
  punchClockConfiguration: 'punch-clock-configuration',
  dailyAttendance: 'daily-attendance',
  periodSummary: 'period-summary',
  access: 'access',
  publicPage: 'public-page'
} as const
export type Area = (typeof Area)[keyof typeof Area]
export const AREAS: readonly Area[] = Object.values(Area)

// Test layers, as they appear in case IDs (`AUTH-UI-001`) and test folders (`tests/ui/`).
export const Layer = {
  ui: 'ui',
  api: 'api',
  e2e: 'e2e'
} as const
export type Layer = (typeof Layer)[keyof typeof Layer]
