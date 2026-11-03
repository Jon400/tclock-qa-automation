---
name: adding-a-page-object
description: Add or extend a page object, a component or a label map in src/ui/ for a TClock screen. Use when a spec needs a screen, control or dialog the framework does not have yet, or when a test developer files a framework request for one.
---

# Adding a Page Object

Specs never locate elements: page objects and components do. One page object per route,
one component per reusable piece of UI, one label map per page object.

## Files

| File | Holds |
|---|---|
| `src/ui/labels/<page>.he.ts` | the Hebrew accessible names, copied exactly from `.doc/sut/<area>.md` |
| `src/ui/pages/<page>-page.ts` | `class <Name>Page extends TClockBasePage`, `static readonly PATH` |
| `src/ui/components/<thing>.ts` | a TClock component used on several pages (`Navbar`, `ReAuthDialog`) |
| `src/ui/components/mui/<thing>.ts` | a generic MUI widget (`Dialog`, `DataTable`, `DatePicker`): nothing TClock-specific |

## Pattern

```ts
// src/ui/labels/user-list.he.ts
// /users/list: the company's users.
export const userListLabels = {
  heading: 'משתמשים',
  addUser: 'הוספת משתמש'
} as const

// src/ui/pages/user-list-page.ts
export class UserListPage extends TClockBasePage {
  static readonly PATH = '/users/list'

  readonly heading: Locator
  readonly addUserButton: Locator

  constructor(page: Page) {
    super(page)
    this.heading = page.getByRole('heading', { name: userListLabels.heading })
    this.addUserButton = page.getByRole('button', { name: userListLabels.addUser, exact: true })
  }

  async open(): Promise<this> {
    await this.goto(UserListPage.PATH)
    await this.heading.waitFor()
    return this
  }

  // An action backed by an API call waits for the response, never for time.
  async addUser(): Promise<void> {
    await this.waitForApi(WebRoute.userProvisionOptions, () => this.addUserButton.click())
  }
}
```

The names in this example are illustrative; take the real ones from the exploration notes.

## Rules

- Locator priority: `getByRole` > `getByLabel` > `getByPlaceholder` > `getByText`. No XPath,
  no layout or generated CSS classes. A stable MUI role class is allowed only inside
  `components/mui/`, with a comment.
- Scope locators to their region (`this.navbar.mainNavigation.getByRole(...)`) and use
  `exact: true` when one name is the prefix of another.
- Expose `Locator`s for what specs assert on, and `async` methods for what users do. Methods
  return the next page object when the action navigates.
- `open()` waits for something the page always renders; `visit()` (no wait) is for checking
  where an anonymous or expired session ends up.
- Wait with `waitForApi` / `waitForResponse` started before the click, or with web-first
  assertions. Never `waitForTimeout`.
- No assertions inside page objects, except a wait that defines "the page is open".
- Generic code stays generic: `base-page.ts` and `components/mui/` know nothing about TClock.

## Done when

`npx tsc --noEmit` and `npx eslint src/` pass, the framework-architect report lists the new page
object with a one-line usage example, and the spec that asked for it can be written without a
single locator.
