import { getAuthenticatorName } from '@better-auth/passkey'
import { summariseUserAgent } from '@/lib/client-ip'

const NAME_MAX = 40

// Names people recognise, where the plugin's own table uses another word.
const FRIENDLY: Record<string, string> = {
  'Apple Passwords': 'iCloud Keychain',
  'iCloud Keychain (Managed)': 'iCloud Keychain',
}

/** "Mac", "iPhone", "Android phone", "Windows PC"… as in the sessions list. */
function deviceOf(userAgent: string | null): string | null {
  const { device } = summariseUserAgent(userAgent)
  return device === 'Unknown device' ? null : device
}

/**
 * The name a new passkey gets (spec decision 14): "iCloud Keychain · iPhone", "Windows Hello ·
 * Windows PC", "1Password · Mac"; for an unknown or all-zero authenticator, Apple devices fall
 * back to iCloud Keychain (Apple sends zeros under `attestation: 'none'`), anything else to
 * "Passkey · Chrome on Mac". Never more than 40 characters.
 */
export function defaultPasskeyName(
  aaguid: string | null | undefined,
  userAgent: string | null,
): string {
  const known = getAuthenticatorName(aaguid ?? undefined)
  const device = deviceOf(userAgent)
  const apple = device === 'iPhone' || device === 'iPad' || device === 'Mac'
  const manager = known ? (FRIENDLY[known] ?? known) : apple ? 'iCloud Keychain' : null
  const name = manager
    ? device
      ? `${manager} · ${device}`
      : manager
    : (() => {
        const { browser } = summariseUserAgent(userAgent)
        const on = device && browser !== 'Unknown browser' ? `${browser} on ${device}` : device
        return on ? `Passkey · ${on}` : 'Passkey'
      })()
  return name.length > NAME_MAX ? name.slice(0, NAME_MAX).trimEnd() : name
}
