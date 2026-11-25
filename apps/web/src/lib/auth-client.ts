import { AUTH_BASE_PATH, authSessionFields, authUserFields } from '@vento/shared'
import { emailOTPClient, inferAdditionalFields, twoFactorClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/**
 * Better Auth's client, for sign-up, sign-in, email verification, two-step and password reset.
 * Never use its session hooks for routing: `account.me` (oRPC) is the single source of truth.
 */
export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: AUTH_BASE_PATH,
  plugins: [
    // No redirect: the sign-in screen shows the two-step check itself.
    twoFactorClient(),
    emailOTPClient(),
    inferAdditionalFields({ user: authUserFields, session: authSessionFields }),
  ],
})
