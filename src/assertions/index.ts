import { expect as baseExpect, type APIResponse, type Page } from '@playwright/test'
import { Snackbar } from '../ui/components/mui/snackbar'
import { accessDeniedLabels } from '../ui/labels/access-denied.he'

// Named, reusable assertions. Specs import `expect` from tests/fixtures.ts, which re-exports
// this one, so every matcher here is available in every spec.

interface MatcherOptions {
  timeout?: number
}

function isApiResponse(value: Page | APIResponse): value is APIResponse {
  return typeof (value as APIResponse).headersArray === 'function'
}

export const expect = baseExpect.extend({
  // UI: the page shows TClock's access-denied warning.
  // API: the response is a 401 or 403.
  async toBeAccessDenied(received: Page | APIResponse, options: MatcherOptions = {}) {
    const name = 'toBeAccessDenied'

    if (isApiResponse(received)) {
      const status = received.status()
      const pass = status === 401 || status === 403
      return {
        name,
        pass,
        expected: '401 or 403',
        actual: status,
        message: () =>
          `${this.utils.matcherHint(name, undefined, undefined, { isNot: this.isNot })}\n\n` +
          `Expected ${received.url()} ${this.isNot ? 'not ' : ''}to be denied (401/403), got ${status}`
      }
    }

    const warning = received.getByRole('alert').filter({ hasText: accessDeniedLabels.title })
    let pass: boolean
    let error = ''
    try {
      const expectation = this.isNot ? baseExpect(warning).not : baseExpect(warning)
      await expectation.toBeVisible(options)
      pass = !this.isNot
    } catch (caught) {
      pass = this.isNot
      error = caught instanceof Error ? caught.message : String(caught)
    }
    return {
      name,
      pass,
      message: () =>
        `${this.utils.matcherHint(name, undefined, undefined, { isNot: this.isNot })}\n\n` +
        `Expected ${received.url()} ${this.isNot ? 'not ' : ''}to show the access-denied warning.\n${error}`
    }
  },

  // A MUI snackbar with this text is visible. Pass the text from a label map.
  async toShowSnackbar(received: Page, text: string | RegExp, options: MatcherOptions = {}) {
    const name = 'toShowSnackbar'
    const message = new Snackbar(received).message(text)
    let pass: boolean
    let error = ''
    try {
      const expectation = this.isNot ? baseExpect(message).not : baseExpect(message)
      await expectation.toBeVisible(options)
      pass = !this.isNot
    } catch (caught) {
      pass = this.isNot
      error = caught instanceof Error ? caught.message : String(caught)
    }
    return {
      name,
      pass,
      message: () =>
        `${this.utils.matcherHint(name, undefined, undefined, { isNot: this.isNot })}\n\n` +
        `Expected ${this.isNot ? 'no ' : 'a '}snackbar with ${String(text)}.\n${error}`
    }
  }
})
