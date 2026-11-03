# Waiting and Flakiness

- Use web-first assertions (`await expect(locator).toBeVisible()`), which retry until the
  timeout. Never assert on a value read once (`expect(await locator.isVisible()).toBe(true)`).
- For an action backed by an API call, wait for the response, not for time:
  start `page.waitForResponse(...)` before the click and await both. `BasePage` has a helper.
- No fixed sleeps: `waitForTimeout`, `setTimeout` in tests, or polling loops without a
  deadline. ESLint blocks `waitForTimeout` in specs.
- Retries are always 0 (the gate's config guard enforces it). A retry hides flakiness.
- A test that fails sometimes is a bug in the test or the product. Fix it, or propose a
  quarantine. Quarantine happens only through `.test/quarantine.md`, which only the owner
  edits, and the `@quarantine` tag the gate checks against it.
- Every new or changed case runs `newCaseRepeat` times (3 by default) before it counts.
