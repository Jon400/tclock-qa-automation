// TClock's /web/* back-office endpoints, exactly as the SUT serves them. Page objects use these
// to wait for the call behind an action; clients use them to make the call.
export const WebRoute = {
  authStart: '/web/auth/start',
  authVerify: '/web/auth/verify',
  authSession: '/web/auth/session',
  authLogout: '/web/auth/logout',
  userProvisionOptions: '/web/users/provision-options'
} as const
export type WebRoute = (typeof WebRoute)[keyof typeof WebRoute]
