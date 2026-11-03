import type { BrowserContext } from '@playwright/test'

// The UI is pinned to Hebrew, light mode, and Israel time, so labels and dates are stable.
export const UI_LOCALE = 'he-IL'
export const UI_TIMEZONE = 'Asia/Jerusalem'

// TClock stores its preferences in localStorage under these keys.
export const UI_PREFERENCES = {
  'tclock-language': 'he',
  'tclock-color-mode': 'light'
} as const

// Runs in every page before the app's own scripts, so the app starts in Hebrew/light mode.
export async function pinUiPreferences(context: BrowserContext): Promise<void> {
  await context.addInitScript(preferences => {
    for (const [key, value] of Object.entries(preferences)) {
      window.localStorage.setItem(key, value)
    }
  }, UI_PREFERENCES)
}
