import {
  test as base,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestDetails
} from '@playwright/test'
import { loginWithPasskey } from '../src/auth/passkey-login'
import { Role } from '../src/config/enum'
import { pinUiPreferences } from '../src/config/locale'
import { storageStatePath } from '../src/config/paths'
import { loadSettings, requirePhone, type Settings } from '../src/config/settings'
import { CleanupRegistry } from '../src/data/cleanup-registry'
import { exists } from '../src/utils/file-utils'
import { parseCaseId } from '../src/utils/case-id'

export { expect } from '../src/assertions'

// The pytest conftest.py of this framework. Worker-scoped fixtures live once per worker
// process (≈ session scope per xdist worker); test-scoped ones are fresh for every test.
interface WorkerFixtures {
  settings: Settings
  runId: string
}

interface TestFixtures {
  // The project's context options (baseURL, locale, timezone, viewport...) for contexts the
  // fixtures create themselves. Playwright's own `contextOptions` holds only the extras.
  newContextOptions: BrowserContextOptions
  operatorPage: Page
  employeePage: Page
  // A separate, freshly logged-in session, for cases that end or change their session
  // (logout, expiry) and so must not touch the shared one in .auth/operator.json.
  freshOperatorPage: Page
  operatorApi: APIRequestContext
  employeeApi: APIRequestContext
  anonymousApi: APIRequestContext
  cleanup: CleanupRegistry
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // Auto: every worker validates the environment (BASE_URL allowlist included) first.
  settings: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern
    async ({}, use) => {
      await use(loadSettings())
    },
    { scope: 'worker', auto: true }
  ],

  runId: [
    async ({ settings }, use) => {
      const runId = settings.runId ?? process.env.RUN_ID
      if (!runId) throw new Error('RUN_ID is not set; playwright.config.ts sets it for every run')
      await use(runId)
    },
    { scope: 'worker' }
  ],

  // The built-in context, pinned to Hebrew and light mode like every other context here.
  context: async ({ context }, use) => {
    await pinUiPreferences(context)
    await use(context)
  },

  newContextOptions: async (
    {
      contextOptions,
      baseURL,
      locale,
      timezoneId,
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      colorScheme
    },
    use
  ) => {
    await use({
      ...contextOptions,
      baseURL,
      locale,
      timezoneId,
      viewport,
      userAgent,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      colorScheme
    })
  },

  operatorPage: async ({ browser, newContextOptions }, use) => {
    const context = await roleContext(browser, newContextOptions, Role.operator)
    await use(await context.newPage())
    await context.close()
  },

  employeePage: async ({ browser, newContextOptions }, use) => {
    const context = await roleContext(browser, newContextOptions, Role.employee)
    await use(await context.newPage())
    await context.close()
  },

  freshOperatorPage: async ({ browser, newContextOptions, settings }, use) => {
    const context = await browser.newContext(newContextOptions)
    await pinUiPreferences(context)
    const page = await context.newPage()
    await loginWithPasskey(page, Role.operator, requirePhone(settings, Role.operator))
    await use(page)
    await context.close()
  },

  operatorApi: async ({ playwright, settings }, use) => {
    const api = await playwright.request.newContext({
      baseURL: settings.baseUrl,
      storageState: await requireStorageState(Role.operator)
    })
    await use(api)
    await api.dispose()
  },

  employeeApi: async ({ playwright, settings }, use) => {
    const api = await playwright.request.newContext({
      baseURL: settings.baseUrl,
      storageState: await requireStorageState(Role.employee)
    })
    await use(api)
    await api.dispose()
  },

  anonymousApi: async ({ playwright, settings }, use) => {
    const api = await playwright.request.newContext({ baseURL: settings.baseUrl })
    await use(api)
    await api.dispose()
  },

  // eslint-disable-next-line no-empty-pattern -- Playwright fixtures take an object pattern
  cleanup: async ({}, use) => {
    const registry = new CleanupRegistry()
    await use(registry)
    await registry.runAll()
  }
})

// Test details for one planned case: the `case` annotation the gate traces, the Allure ID,
// and the area tag derived from the ID. testCase('AUTH-UI-001', '@smoke') →
// tags @auth @smoke.
export type ExtraTag = '@smoke' | '@serial' | '@quarantine'

export function testCase(id: string, ...tags: ExtraTag[]): TestDetails {
  const parsed = parseCaseId(id)
  if (!parsed) {
    throw new Error(`"${id}" is not a case ID (<AREA>-<UI|API|E2E>-NNN)`)
  }
  return {
    tag: [`@${parsed.area}`, ...tags],
    annotation: [
      { type: 'case', description: id },
      { type: '@allure.id', description: id }
    ]
  }
}

async function roleContext(
  browser: Browser,
  options: BrowserContextOptions,
  role: Role
): Promise<BrowserContext> {
  const context = await browser.newContext({
    ...options,
    storageState: await requireStorageState(role)
  })
  await pinUiPreferences(context)
  return context
}

async function requireStorageState(role: Role): Promise<string> {
  const file = storageStatePath(role)
  if (!(await exists(file))) {
    throw new Error(
      `No session for "${role}" (${file}). Run the setup project first: npm run test:setup`
    )
  }
  return file
}
