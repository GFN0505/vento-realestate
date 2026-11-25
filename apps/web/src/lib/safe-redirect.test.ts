import { describe, expect, it } from 'vitest'
import { safeRedirect } from './safe-redirect'

describe('safeRedirect', () => {
  it('keeps a path on this site with its query and hash', () => {
    expect(safeRedirect('/sales/units?page=2#b12')).toBe('/sales/units?page=2#b12')
  })

  it('falls back when there is no target', () => {
    expect(safeRedirect(undefined)).toBe('/')
    expect(safeRedirect('', '/home')).toBe('/home')
    expect(safeRedirect(42)).toBe('/')
  })

  it('rejects protocol-relative and absolute URLs', () => {
    expect(safeRedirect('//evil.com')).toBe('/')
    expect(safeRedirect('//evil.com/sign-in')).toBe('/')
    expect(safeRedirect('https://evil.com')).toBe('/')
    expect(safeRedirect('javascript:alert(1)')).toBe('/')
  })

  it('rejects backslash and control-character tricks', () => {
    expect(safeRedirect('/\\evil.com')).toBe('/')
    expect(safeRedirect('/\t/evil.com')).toBe('/')
    expect(safeRedirect('/%0a/evil.com')).toBe('/%0a/evil.com')
  })

  it('rejects relative paths that do not start at the root', () => {
    expect(safeRedirect('sales')).toBe('/')
  })
})
