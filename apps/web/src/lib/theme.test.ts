import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampSidebarWidth,
  getTheme,
  resolveTheme,
  SIDEBAR_COLLAPSE_BELOW,
  SIDEBAR_COLLAPSED,
  SIDEBAR_KEY,
  SIDEBAR_WIDTH,
  SIDEBAR_WIDTH_KEY,
  setSidebarCollapsed,
  setSidebarWidth,
  setTheme,
  storedSidebarWidth,
  THEME_KEY,
  widthFromDrag,
  widthFromKey,
} from './theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  delete document.documentElement.dataset.sidebar
  document.documentElement.style.removeProperty('--sidebar-open-width')
  vi.unstubAllGlobals()
})

describe('theme', () => {
  it('is light on a first visit', () => {
    expect(getTheme()).toBe('light')
  })

  it('remembers a choice and applies it to the page', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {} }))
    setTheme('dark')
    expect(getTheme()).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    setTheme('light')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('follows the device on System', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('remembers the collapsed sidebar', () => {
    setSidebarCollapsed(true)
    expect(localStorage.getItem(SIDEBAR_KEY)).toBe(SIDEBAR_COLLAPSED)
    expect(document.documentElement.dataset.sidebar).toBe('collapsed')
  })

  it('uses the same keys and values as the pre-paint script in index.html', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
    expect(html).toContain(`localStorage.getItem('${THEME_KEY}')`)
    expect(html).toContain(`localStorage.getItem('${SIDEBAR_KEY}') === '${SIDEBAR_COLLAPSED}'`)
    expect(html).toContain(`root.dataset.sidebar = '${SIDEBAR_COLLAPSED}'`)
    expect(html).toContain("stored === 'dark'")
    expect(html).toContain("stored === 'system'")
  })
})

describe('sidebar width', () => {
  it('stays between 220 and 320', () => {
    expect(clampSidebarWidth(100)).toBe(220)
    expect(clampSidebarWidth(400)).toBe(320)
    expect(clampSidebarWidth(263.4)).toBe(263)
    expect(clampSidebarWidth(Number.NaN)).toBe(256)
  })

  it('snaps to collapsed when dragged below 180, and opens again when dragged out', () => {
    expect(widthFromDrag(179)).toEqual({ collapsed: true, width: 220 })
    expect(widthFromDrag(SIDEBAR_COLLAPSE_BELOW)).toEqual({ collapsed: false, width: 220 })
    expect(widthFromDrag(290)).toEqual({ collapsed: false, width: 290 })
    expect(widthFromDrag(500)).toEqual({ collapsed: false, width: 320 })
  })

  it('steps 16px with the arrows, 48 with Shift, and jumps with Home and End', () => {
    expect(widthFromKey(256, 'ArrowRight', false)).toBe(272)
    expect(widthFromKey(256, 'ArrowLeft', false)).toBe(240)
    expect(widthFromKey(256, 'ArrowLeft', true)).toBe(220)
    expect(widthFromKey(300, 'ArrowRight', true)).toBe(320)
    expect(widthFromKey(256, 'Home', false)).toBe(SIDEBAR_WIDTH.min)
    expect(widthFromKey(256, 'End', false)).toBe(SIDEBAR_WIDTH.max)
    expect(widthFromKey(256, 'a', false)).toBeNull()
  })

  it('remembers a width on this device and forgets the default', () => {
    setSidebarWidth(300)
    expect(localStorage.getItem(SIDEBAR_WIDTH_KEY)).toBe('300')
    expect(storedSidebarWidth()).toBe(300)
    expect(document.documentElement.style.getPropertyValue('--sidebar-open-width')).toBe('300px')
    setSidebarWidth(256)
    expect(localStorage.getItem(SIDEBAR_WIDTH_KEY)).toBeNull()
  })

  it('ignores a stored width out of range', () => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, '900')
    expect(storedSidebarWidth()).toBe(256)
  })

  it('is applied before first paint by the script in index.html', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8')
    const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'))
    localStorage.setItem(SIDEBAR_WIDTH_KEY, '288')
    new Function(script)()
    expect(document.documentElement.style.getPropertyValue('--sidebar-open-width')).toBe('288px')
    localStorage.setItem(SIDEBAR_WIDTH_KEY, '999')
    document.documentElement.style.removeProperty('--sidebar-open-width')
    new Function(script)()
    expect(document.documentElement.style.getPropertyValue('--sidebar-open-width')).toBe('')
  })
})
