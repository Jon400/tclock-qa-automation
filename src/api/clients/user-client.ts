import type { APIResponse } from '@playwright/test'
import { BaseClient } from '../base-client'
import { WebRoute } from '../routes'

// /web/users/*: company management of users (admin and operator only). The `user` area
// request adds provisioning, search, update and deactivation.
export class UserClient extends BaseClient {
  // A read-only company-management call: the lightest way to probe who may use the area.
  getProvisionOptions(expectedStatus = 200): Promise<APIResponse> {
    return this.executeGet(WebRoute.userProvisionOptions, { expectedStatus })
  }
}
