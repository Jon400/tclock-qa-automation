import { SessionClient } from '../../../src/api/clients/session-client'
import { UserClient } from '../../../src/api/clients/user-client'
import { SutRole } from '../../../src/config/enum'
import { expect, test, testCase } from '../../fixtures'

test.describe('session API', () => {
  test(
    'the session endpoint reports the operator role for the operator cookies',
    testCase('AUTH-API-001', '@smoke'),
    async ({ operatorApi }) => {
      const session = await new SessionClient(operatorApi).getSession()

      expect(session.user.db_role).toBe(SutRole.operator)
    }
  )

  test(
    'a company-management endpoint rejects an unauthenticated call',
    testCase('AUTH-API-002', '@smoke'),
    async ({ anonymousApi }) => {
      const response = await new UserClient(anonymousApi).getProvisionOptions(401)

      await expect(response).toBeAccessDenied()
    }
  )
})
