import { describe, expect, it } from 'vitest'
import { maskIp, resolveClientIp, summariseUserAgent } from './client-ip'

describe('resolveClientIp', () => {
  it('uses the socket address when no proxy header is trusted', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4' })
    expect(resolveClientIp(headers, '102.89.34.17', undefined)).toBe('102.89.34.17')
  })

  it('uses the first address of a trusted proxy header', () => {
    const headers = new Headers({ 'x-forwarded-for': '102.89.34.17, 10.0.0.1' })
    expect(resolveClientIp(headers, '10.0.0.1', 'x-forwarded-for')).toBe('102.89.34.17')
  })

  it('unwraps IPv4-mapped IPv6 and ignores junk', () => {
    expect(resolveClientIp(new Headers(), '::ffff:102.89.34.17', undefined)).toBe('102.89.34.17')
    const headers = new Headers({ 'x-forwarded-for': 'not-an-ip' })
    expect(resolveClientIp(headers, undefined, 'x-forwarded-for')).toBeNull()
  })
})

describe('maskIp', () => {
  it('keeps the first three octets of IPv4', () => {
    expect(maskIp('102.89.34.17')).toBe('102.89.34.x')
  })

  it('keeps the first two groups of IPv6', () => {
    expect(maskIp('2c0f:f5c0:abcd:1234::1')).toBe('2c0f:f5c0:••••')
    expect(maskIp('2A02:8109:1:2:3:4:5:6')).toBe('2a02:8109:••••')
  })

  it('drops loopback, private and link-local addresses', () => {
    for (const ip of [
      '::1',
      '::',
      '127.0.0.1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.9',
      '169.254.0.1',
      '100.64.0.1',
      'fd12:3456::1',
      'fe80::1',
    ]) {
      expect(maskIp(ip)).toBeNull()
    }
  })

  it('never shows an all-zero IPv6 prefix', () => {
    expect(maskIp('0:0:0:0:0:0:0:1')).toBeNull()
  })

  it('returns null for missing or invalid input', () => {
    expect(maskIp(null)).toBeNull()
    expect(maskIp('nonsense')).toBeNull()
  })
})

describe('summariseUserAgent', () => {
  it('recognises Chrome on an Android phone', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
    expect(summariseUserAgent(ua)).toEqual({ device: 'Android phone', browser: 'Chrome' })
  })

  it('recognises Safari on an iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    expect(summariseUserAgent(ua)).toEqual({ device: 'iPhone', browser: 'Safari' })
  })
})
