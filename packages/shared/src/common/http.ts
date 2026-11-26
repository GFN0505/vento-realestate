/**
 * The organization a browser tab is showing, sent on every oRPC call (decision 0013). The
 * server refuses a mismatch with the session; it never uses the value to choose an organization.
 */
export const ORGANIZATION_HEADER = 'x-vento-organization'

/**
 * "Keep me signed in" for a passkey sign-in: `1` on POST /api/auth/passkey/verify-authentication
 * (the plugin ignores a body `rememberMe`). Set at request time, so ticking the box after the
 * browser's passkey prompt opened still counts. Anything else means a 12-hour session.
 */
export const REMEMBER_ME_HEADER = 'x-vento-remember'
