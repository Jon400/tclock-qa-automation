import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'
import { UI_LOCALE, UI_TIMEZONE } from './src/config/locale'
import { runDir, runStepDir } from './src/config/paths'
import { loadSettings } from './src/config/settings'
import { createRunId } from './src/data/run-id'

// One run id per invocation. The main process sets it before the workers start, so every
// worker (which re-evaluates this file) inherits the same value. tools/dev-loop sets it itself.
process.env.RUN_ID ||= createRunId()

// Validates the environment, including the BASE_URL host allowlist, before any test or
// browser starts. Throws SettingsError. Works without .env: everything has a default.
const settings = loadSettings()
const runId = process.env.RUN_ID
const stepDir = runStepDir(runId, settings.runStep)
// `--list` runs nothing, so it writes no run artifacts.
const listing = process.argv.includes('--list')

export default defineConfig({
  testDir: './tests',
  outputDir: path.join(stepDir, 'test-results'),
  fullyParallel: true,
  forbidOnly: true,
  // Always 0: a retry hides flakiness. The gate's config guard fails any other value.
  retries: 0,
  // TClock is someone else's dev server: keep the load to what a careful tester generates.
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: listing
    ? [['list']]
    : [
        ['list'],
        ['junit', { outputFile: path.join(stepDir, 'junit.xml') }],
        ['json', { outputFile: path.join(stepDir, 'results.json') }],
        ['allure-playwright', { resultsDir: path.join(runDir(runId), 'allure-results') }]
      ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: settings.baseUrl,
    headless: settings.headless,
    locale: UI_LOCALE,
    timezoneId: UI_TIMEZONE,
    actionTimeout: settings.actionTimeoutMs,
    navigationTimeout: settings.navigationTimeoutMs,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off'
  },
  projects: [
    // Logs every role in once per run and saves .auth/<role>.json. tools/dev-loop runs it as
    // its own step, then runs each profile with --no-deps.
    { name: 'setup', testDir: './tests/setup', testMatch: '*.setup.ts' },
    { name: 'ui', testDir: './tests/ui', dependencies: ['setup'] },
    { name: 'api', testDir: './tests/api', dependencies: ['setup'] },
    { name: 'e2e', testDir: './tests/e2e', dependencies: ['setup'] }
  ]
})
