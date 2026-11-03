// Runs in every page the test-planner's Playwright MCP browser opens, before TClock's own
// scripts: the same Hebrew / light-mode pinning that src/config/locale.ts gives the test
// projects, so exploration sees the labels the page objects will use.
try {
  globalThis.localStorage.setItem('tclock-language', 'he')
  globalThis.localStorage.setItem('tclock-color-mode', 'light')
} catch {
  // about:blank and other opaque origins have no localStorage.
}
