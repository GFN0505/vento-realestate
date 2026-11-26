import { passkeyClient } from '@better-auth/passkey/client'
import { AUTH_BASE_PATH } from '@vento/shared'
import { createAuthClient } from 'better-auth/client'

/*
 * Better Auth's passkey client and the WebAuthn browser library under it. Never import this
 * statically: it's loaded with `import()` only when someone starts a passkey action (sign-in
 * page, Session expired, My security, the offer after sign-in), so it never weighs on Home.
 */
export const passkeyAuth = createAuthClient({
  baseURL: window.location.origin,
  basePath: AUTH_BASE_PATH,
  plugins: [passkeyClient()],
})

/** The browser's own prompt was dismissed or timed out: say nothing (spec). */
export function isPasskeyCancel(code: string | undefined): boolean {
  return (
    code === 'ERROR_CEREMONY_ABORTED' ||
    code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' ||
    code === 'AUTH_CANCELLED' ||
    code === 'REGISTRATION_CANCELLED'
  )
}

export const PREVIOUSLY_REGISTERED = 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
