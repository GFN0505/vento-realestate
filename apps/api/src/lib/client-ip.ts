import { isIP } from 'node:net'

/** Header our middleware sets for Better Auth; any value a client sends is replaced. */
export const CLIENT_IP_HEADER = 'x-vento-client-ip'

/**
 * The client's address. Behind a trusted proxy, the first entry of the configured header
 * (the proxy overwrites or appends it); otherwise the socket address. Invalid values are
 * ignored rather than trusted.
 */
export function resolveClientIp(
  headers: Headers,
  socketAddress: string | undefined,
  trustedHeader: string | undefined,
): string | null {
  const raw = trustedHeader ? headers.get(trustedHeader)?.split(',')[0]?.trim() : socketAddress
  if (!raw) return null
  const unwrapped = raw.startsWith('::ffff:') && isIP(raw.slice(7)) === 4 ? raw.slice(7) : raw
  return isIP(unwrapped) ? unwrapped : null
}

/**
 * Enough to recognise a network, never a person. IPv4 keeps /24 ("102.89.34.x"); IPv6 keeps its
 * first two groups ("2a02:8109:••••"). Loopback, private and link-local addresses say nothing
 * useful about where someone is, so they're dropped (null), never shown as "0:0:0".
 */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const version = isIP(ip)
  if (version === 4) {
    return isLocalIpv4(ip) ? null : `${ip.split('.').slice(0, 3).join('.')}.x`
  }
  if (version === 6) {
    const groups = expandIpv6(ip)
    if (!groups || isLocalIpv6(groups)) return null
    return `${groups.slice(0, 2).join(':')}:••••`
  }
  return null
}

function isLocalIpv4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

function isLocalIpv6(groups: string[]): boolean {
  const first = Number.parseInt(groups[0] ?? '0', 16)
  // ::, ::1 (and any all-zero prefix), unique local fc00::/7, link-local fe80::/10.
  if (groups.slice(0, 7).every((g) => g === '0')) return true
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80
}

function expandIpv6(ip: string): string[] | null {
  const [head = '', tail] = ip.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const missing = 8 - left.length - right.length
  if (tail === undefined && left.length !== 8) return null
  const groups = [...left, ...Array<string>(Math.max(missing, 0)).fill('0'), ...right]
  return groups.map((g) => g.toLowerCase().replace(/^0+(?=.)/, ''))
}

export type UserAgentSummary = { device: string; browser: string }

/** "Chrome on Mac". Deliberately rough: enough to recognise your own devices. */
export function summariseUserAgent(ua: string | null | undefined): UserAgentSummary {
  const s = ua ?? ''
  const device = /iPhone/.test(s)
    ? 'iPhone'
    : /iPad/.test(s)
      ? 'iPad'
      : /Android/.test(s)
        ? /Mobile/.test(s)
          ? 'Android phone'
          : 'Android tablet'
        : /Macintosh|Mac OS X/.test(s)
          ? 'Mac'
          : /Windows/.test(s)
            ? 'Windows PC'
            : /Linux/.test(s)
              ? 'Linux PC'
              : 'Unknown device'
  const browser = /Edg\//.test(s)
    ? 'Edge'
    : /OPR\/|Opera/.test(s)
      ? 'Opera'
      : /SamsungBrowser/.test(s)
        ? 'Samsung Internet'
        : /Firefox\//.test(s)
          ? 'Firefox'
          : /Chrome\/|CriOS\//.test(s)
            ? 'Chrome'
            : /Safari\//.test(s)
              ? 'Safari'
              : 'Unknown browser'
  return { device, browser }
}

export function userAgentLabel(ua: string | null | undefined): string | null {
  if (!ua) return null
  const { device, browser } = summariseUserAgent(ua)
  return `${browser} on ${device}`
}
