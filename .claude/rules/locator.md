# Locators

Applies to page objects and components in `src/ui/`.

- Locators live only in page objects and components. Specs never call `page.locator`,
  `getBy*`, or `request.*`; ESLint blocks it in `tests/{ui,api,e2e}`.
- Priority: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText`. TClock has no
  `data-testid`s, so role plus accessible name is the default.
- No XPath, and no CSS selectors tied to layout or generated MUI class names
  (`.css-1x2y3z`, `.MuiBox-root > div:nth-child(2)`). A stable MUI role class
  (`.MuiDataGrid-row`) is allowed inside `src/ui/components/mui/` only, with a comment.
- Hebrew text appears only in label maps, `src/ui/labels/<page>.he.ts`. Page objects import
  the accessible name from there; nothing else contains Hebrew string literals.
- Scope a locator to its region (`this.navbar.root.getByRole(...)`) instead of making it
  page-global, and use `exact: true` when a name is a prefix of another.
- `src/ui/base-page.ts` and `src/ui/components/mui/` stay generic: nothing TClock-specific.
