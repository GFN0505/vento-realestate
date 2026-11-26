import { describe, expect, it } from 'vitest'
import {
  backupCodesWords,
  lastActiveWords,
  orderSessions,
  passkeyUseWords,
  thisDeviceKind,
  whereWords,
} from './security-words'

const now = new Date('2026-11-26T12:00:00+01:00')

describe('My security words', () => {
  it('says how long ago a device was active', () => {
    expect(lastActiveWords('2026-11-26T11:58:00+01:00', now)).toBe('Active now')
    expect(lastActiveWords('2026-11-26T11:30:00+01:00', now)).toBe('30 minutes ago')
    expect(lastActiveWords('2026-11-26T10:00:00+01:00', now)).toBe('2 hours ago')
    expect(lastActiveWords('2026-11-25T20:00:00+01:00', now)).toBe('Yesterday')
    expect(lastActiveWords('2026-11-12T09:00:00+01:00', now)).toBe('12 Nov 2026')
  })

  it('says when a passkey was added and last used', () => {
    expect(passkeyUseWords('2026-11-06T09:00:00Z', '2026-11-26T08:00:00Z', now)).toBe(
      'Added 6 Nov 2026 · Last used today',
    )
    expect(passkeyUseWords('2026-11-06T09:00:00Z', null, now)).toBe('Added 6 Nov 2026 · Never used')
  })

  it('leaves out the place or the address when unknown', () => {
    expect(whereWords({ place: 'Lekki, Lagos', ipMasked: '102.89.34.x' })).toBe(
      'Lekki, Lagos · IP 102.89.34.x',
    )
    expect(whereWords({ place: null, ipMasked: '102.89.34.x' })).toBe('IP 102.89.34.x')
    expect(whereWords({ place: null, ipMasked: null })).toBeNull()
  })

  it('lists this device first, then the most recently active', () => {
    const rows = [
      { id: 'a', isCurrent: false, lastActiveAt: '2026-11-20T00:00:00Z' },
      { id: 'b', isCurrent: false, lastActiveAt: '2026-11-25T00:00:00Z' },
      { id: 'c', isCurrent: true, lastActiveAt: '2026-11-01T00:00:00Z' },
    ]
    expect(orderSessions(rows).map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('turns the backup codes line amber at 3 or fewer', () => {
    expect(backupCodesWords(8)).toEqual({ text: '8 of 10 left', low: false })
    expect(backupCodesWords(3)).toEqual({
      text: "3 left. Make new ones so you don't get locked out.",
      low: true,
    })
  })

  it('recognises the kind of device from the browser', () => {
    expect(thisDeviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('iPhone')
    expect(thisDeviceKind('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Mac')
    expect(thisDeviceKind('Mozilla/5.0 (Linux; Android 14; SM-A546E)')).toBe('Android')
  })
})
