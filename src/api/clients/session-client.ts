import type { APIResponse } from '@playwright/test'
import { BaseClient } from '../base-client'
import { WebRoute } from '../routes'
import { WebErrorSchema, type WebError } from '../schemas/error'
import { SessionResponseSchema, type SessionResponse } from '../schemas/session'

// /web/auth/*: the session behind the caller's cookies.
export class SessionClient extends BaseClient {
  // The raw call, for negative cases: requestSession(401).
  requestSession(expectedStatus = 200): Promise<APIResponse> {
    return this.executeGet(WebRoute.authSession, { expectedStatus })
  }

  async getSession(): Promise<SessionResponse> {
    return this.parse(await this.requestSession(200), SessionResponseSchema)
  }

  logout(expectedStatus = 200): Promise<APIResponse> {
    return this.executePost(WebRoute.authLogout, { expectedStatus })
  }

  readError(response: APIResponse): Promise<WebError> {
    return this.parse(response, WebErrorSchema)
  }
}
