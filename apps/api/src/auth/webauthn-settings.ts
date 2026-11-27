import { env } from '@/env'

// One source for the WebAuthn relying party (decision 0019), read by the passkey plugin and by
// the console's in-place passkey check, so the two can't drift.

export type WebAuthnSettings = {
  /** The web app's host name: passkeys are bound to it. */
  rpID: string
  rpName: string
  /** The exact origin a browser signs for. */
  origin: string
  /** Every passkey must check the person (biometric or PIN). */
  userVerification: 'required'
}

export function webAuthnSettings(webOrigin: string = env.WEB_ORIGIN): WebAuthnSettings {
  const url = new URL(webOrigin)
  return {
    rpID: url.hostname,
    rpName: 'Vento Real Estate',
    origin: url.origin,
    userVerification: 'required',
  }
}
