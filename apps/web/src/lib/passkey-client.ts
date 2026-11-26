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

/*
 * The WebAuthn library aborts a ceremony only when another starts, and it isn't ours to import.
 * So every `navigator.credentials.get` also listens to a controller of ours, and
 * `cancelPasskeyCeremony()` ends the email field's waiting passkey suggestions (leaving the
 * sign-in page, or signing in with a password instead).
 */
let current: AbortController | null = null

function makeCancellable() {
  const credentials = typeof navigator === 'undefined' ? undefined : navigator.credentials
  if (!credentials || cancellable.has(credentials)) return
  cancellable.add(credentials)
  const get = credentials.get.bind(credentials)
  credentials.get = (options?: CredentialRequestOptions) => {
    const ours = new AbortController()
    current = ours
    const theirs = options?.signal
    if (theirs?.aborted) ours.abort(theirs.reason)
    else theirs?.addEventListener('abort', () => ours.abort(theirs.reason), { once: true })
    return get({ ...options, signal: ours.signal }).finally(() => {
      if (current === ours) current = null
    })
  }
}
const cancellable = new WeakSet<CredentialsContainer>()
makeCancellable()

export function cancelPasskeyCeremony(): void {
  current?.abort(new DOMException('The passkey request was cancelled.', 'AbortError'))
  current = null
}
