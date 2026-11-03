import { HomePage } from '../../../src/ui/pages/home-page'
import { expect, test, testCase } from '../../fixtures'

test.describe('login and role', () => {
  test(
    'the operator is logged in and sees the company-management navbar',
    testCase('AUTH-UI-001', '@smoke'),
    async ({ operatorPage }) => {
      const home = await new HomePage(operatorPage).open()

      await expect(home.welcomeHeading).toBeVisible()
      await expect(home.navbar.menu('company')).toBeVisible()
      await expect(home.navbar.menu('users')).toBeVisible()
      await expect(home.navbar.menu('attendanceManagement')).toBeVisible()
    }
  )
})
