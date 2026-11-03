import { TClockBasePage } from './tclock-base-page'

// /users/list, a company-management route (admin and operator only). The `user` area
// request extends this page object with the search and the results table.
export class UserListPage extends TClockBasePage {
  static readonly PATH = '/users/list'

  // Navigates only: for a role without access this page renders the access-denied warning.
  async open(): Promise<this> {
    await this.goto(UserListPage.PATH)
    return this
  }
}
