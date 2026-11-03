// Owner-only: enrolls a QA user's passkey once, then proves the stored passkey logs in from a
// fresh browser. This is the plan's passkey spike (step 6), kept as the re-enrollment tool.
//
//   npm run auth:enroll -- --role operator
//
// Before running: the owner provisions the user in the TClock operator UI with a phone number
// the owner controls, and puts it in .env (QA_OPERATOR_PHONE / QA_EMPLOYEE_PHONE).
// Writes .auth/passkey.<role>.json and .auth/<role>.json, and a summary of the auth calls it
// saw (paths, statuses, `next`; never bodies or cookies) to .orchestrate/explore/.

import path from 'node:path'
import { parseArgs } from 'node:util'
import { chromium, type Browser, type BrowserContext, type Response } from '@playwright/test'
import { enrollPasskey, loginWithPasskey } from '../../src/auth/passkey-login'
import { pinUiPreferences, UI_LOCALE, UI_TIMEZONE } from '../../src/config/locale'
import { REPO_ROOT, storageStatePath } from '../../src/config/paths'
import { loadSettings, parseRole, requirePhone } from '../../src/config/settings'
import { writeJson } from '../../src/utils/file-utils'

interface ObservedCall {
  phase: 'enroll' | 'login'
  method: string
  path: string
  status: number
  next?: string
  sessionHeaders: boolean
}

const { values } = parseArgs({
  options: { role: { type: 'string' }, headed: { type: 'boolean', default: false } }
})
const role = parseRole(values.role ?? process.env.ENROLL_ROLE)
const settings = loadSettings()
const phone = requirePhone(settings, role)
const calls: ObservedCall[] = []

const browser = await chromium.launch({ headless: !values.headed && settings.headless })
try {
  console.log(`Enrolling "${role}" on ${settings.baseUrl} ...`)
  const enrollContext = await newContext(browser, 'enroll')
  const credential = await enrollPasskey(await enrollContext.newPage(), role, phone)
  await enrollContext.close()
  console.log(
    `  enrolled: rpId=${credential.rpId}, resident=${credential.isResidentCredential}, signCount=${credential.signCount}`
  )

  console.log('Logging in from a fresh context with the stored passkey ...')
  const loginContext = await newContext(browser, 'login')
  const page = await loginContext.newPage()
  await loginWithPasskey(page, role, phone)
  await loginContext.storageState({ path: storageStatePath(role) })
  await loginContext.close()
  console.log(`  logged in; session saved for "${role}"`)
} finally {
  await browser.close()
  const report = path.join(REPO_ROOT, '.orchestrate', 'explore', `auth-spike-${role}.json`)
  await writeJson(report, { role, baseUrl: settings.baseUrl, at: new Date().toISOString(), calls })
  console.log(`Observed auth calls: ${report}`)
}

async function newContext(target: Browser, phase: ObservedCall['phase']): Promise<BrowserContext> {
  const context = await target.newContext({
    baseURL: settings.baseUrl,
    locale: UI_LOCALE,
    timezoneId: UI_TIMEZONE
  })
  await pinUiPreferences(context)
  context.on('response', response => void record(phase, response))
  return context
}

async function record(phase: ObservedCall['phase'], response: Response): Promise<void> {
  const url = new URL(response.url())
  if (!url.pathname.startsWith('/web/')) return
  const call: ObservedCall = {
    phase,
    method: response.request().method(),
    path: url.pathname,
    status: response.status(),
    sessionHeaders: Boolean(response.headers()['x-web-session-expires-at'])
  }
  if (url.pathname === '/web/auth/start') {
    const body = (await response.json().catch(() => undefined)) as { next?: string } | undefined
    if (body?.next) call.next = body.next
  }
  calls.push(call)
}
