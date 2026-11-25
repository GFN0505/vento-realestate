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

/** IPv4 keeps /24 ("102.89.34.x"); IPv6 keeps /48. Enough to recognise a network, not a person. */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const version = isIP(ip)
  if (version === 4) return `${ip.split('.').slice(0, 3).join('.')}.x`
  if (version === 6) {
    const groups = expandIpv6(ip)
    return groups ? `${groups.slice(0, 3).join(':')}::/48` : null
  }
  return null
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
