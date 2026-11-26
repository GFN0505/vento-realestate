import type { SessionItem } from '@vento/shared'
import { daysAgoInLagos, formatDate } from '@/lib/format'

/*
 * The small phrases My security builds from data (spec "UI copy"), kept pure so they're tested
 * apart from the cards.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** "Active now", "12 minutes ago", "2 hours ago", "Yesterday", then "12 Nov 2026". */
export function lastActiveWords(iso: string, now: Date = new Date()): string {
  const ago = now.getTime() - Date.parse(iso)
  if (Number.isNaN(ago) || ago < 5 * MINUTE) return 'Active now'
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} minutes ago`
  const days = daysAgoInLagos(iso, now)
  if (days <= 0) {
    const hours = Math.floor(ago / HOUR)
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  }
  if (days === 1) return 'Yesterday'
  return formatDate(iso)
}

/** "Added 26 Nov 2026 · Last used today" / "· Never used". */
export function passkeyUseWords(
  createdAt: string,
  lastUsedAt: string | null,
  now: Date = new Date(),
): string {
  const added = `Added ${formatDate(createdAt)}`
  if (!lastUsedAt) return `${added} · Never used`
  const days = daysAgoInLagos(lastUsedAt, now)
  const used =
    days <= 0
      ? 'today'
      : days === 1
        ? 'yesterday'
        : days < 7
          ? `${days} days ago`
          : formatDate(lastUsedAt)
  return `${added} · Last used ${used}`
}

/** "Chrome on Mac". */
export function deviceWords(session: Pick<SessionItem, 'browser' | 'device'>): string {
  return `${session.browser} on ${session.device}`
}

/**
 * The stored address as shown: IPv4 as stored ("102.89.34.x"), IPv6 as its first two groups
 * ("2a02:8109:••••"). Older sessions stored IPv6 as "a:b:c::/48"; an all-zero one (loopback)
 * is left out, never shown as "0:0:0".
 */
export function displayIp(masked: string | null): string | null {
  if (!masked) return null
  const legacy = /^([0-9a-f]+):([0-9a-f]+):[0-9a-f]+::\/48$/i.exec(masked)
  if (!legacy) return masked
  const [, a = '0', b = '0'] = legacy
  return /^0+$/.test(a) ? null : `${a}:${b}:••••`
}

/** "Lekki, Lagos · IP 102.89.34.x"; either part left out when unknown. */
export function whereWords(session: Pick<SessionItem, 'place' | 'ipMasked'>): string | null {
  const ip = displayIp(session.ipMasked)
  const parts = [session.place, ip && `IP ${ip}`].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

const signedInFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
})

/** "Signed in 26 Nov, 14:20" (Lagos time): tells apart two sessions on the same browser. */
export function signedInWords(createdAt: string): string {
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(signedInFormat.formatToParts(date).map((p) => [p.type, p.value]))
  return `Signed in ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`
}

/** This device first, then the most recently active. */
export function orderSessions<T extends Pick<SessionItem, 'isCurrent' | 'lastActiveAt'>>(
  sessions: readonly T[],
): T[] {
  return [...sessions].sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
    return Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt)
  })
}

export const devicesWords = (n: number) => `${n} ${n === 1 ? 'device' : 'devices'}`

/** "8 of 10 left"; at 3 or fewer the row turns amber with what to do. */
export function backupCodesWords(left: number): { text: string; low: boolean } {
  if (left <= 3) {
    return {
      text:
        left === 0
          ? "None left. Make new ones so you don't get locked out."
          : `${left} left. Make new ones so you don't get locked out.`,
      low: true,
    }
  }
  return { text: `${left} of 10 left`, low: false }
}

/** The kind of device this browser runs on, matched against passkey names ("· iPhone"). */
export function thisDeviceKind(userAgent: string = navigator.userAgent): string | null {
  if (/iPhone/i.test(userAgent)) return 'iPhone'
  if (/iPad/i.test(userAgent)) return 'iPad'
  if (/Android/i.test(userAgent)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac'
  if (/Windows/i.test(userAgent)) return 'Windows'
  return null
}
