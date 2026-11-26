/*
 * What this browser can do with passkeys, answered without loading any WebAuthn library, so the
 * sign-in page, ⌘K and My security can decide what to show for free. The library itself
 * (`lib/passkey-client.ts`) loads only when someone starts a passkey action.
 */

type PublicKeyCredentialStatics = {
  isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>
  isConditionalMediationAvailable?: () => Promise<boolean>
}

function credentialApi(): PublicKeyCredentialStatics | null {
  if (typeof window === 'undefined') return null
  const api = (window as Window & { PublicKeyCredential?: PublicKeyCredentialStatics })
    .PublicKeyCredential
  return typeof api === 'function' ? api : null
}

/** The browser speaks WebAuthn: it can create and use passkeys (its own, a phone's or a key's). */
export function browserSupportsPasskeys(): boolean {
  return credentialApi() !== null
}

/** A built-in Face ID, Touch ID, fingerprint or Windows Hello is ready on this device. */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  try {
    return (await credentialApi()?.isUserVerifyingPlatformAuthenticatorAvailable?.()) === true
  } catch {
    return false
  }
}

/** The email field can offer saved passkeys in its suggestions (`autocomplete="… webauthn"`). */
export async function supportsPasskeyAutofill(): Promise<boolean> {
  try {
    return (await credentialApi()?.isConditionalMediationAvailable?.()) === true
  } catch {
    return false
  }
}
