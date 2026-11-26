import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { consoleClient } from '../api'

export const PASSKEY_CANCELLED = 'cancelled'

/** The browser's prompt was dismissed or timed out: say nothing (3d rule). */
export function isPasskeyCancel(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? error.code : undefined
  return (
    error.name === 'NotAllowedError' ||
    error.name === 'AbortError' ||
    code === 'ERROR_CEREMONY_ABORTED' ||
    code === 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY'
  )
}

/**
 * Asks the device for a passkey assertion against the console's own challenge (plan §4.3: no new
 * sign-in, so no new session). The WebAuthn library loads only on **Use passkey**.
 */
export async function passkeyAssertion(): Promise<
  Record<string, unknown> | typeof PASSKEY_CANCELLED
> {
  const { options } = await consoleClient.console.access.passkeyOptions()
  const { startAuthentication } = await import('@simplewebauthn/browser')
  try {
    // The server built these with the same library; its JSON is this type.
    const optionsJSON = options as unknown as PublicKeyCredentialRequestOptionsJSON
    const response = await startAuthentication({ optionsJSON })
    return { ...response }
  } catch (error) {
    if (isPasskeyCancel(error)) return PASSKEY_CANCELLED
    throw error
  }
}
