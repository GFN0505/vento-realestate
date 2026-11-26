import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getTheme,
  resolveTheme,
  SIDEBAR_COLLAPSED,
  SIDEBAR_KEY,
  setSidebarCollapsed,
  setTheme,
  THEME_KEY,
} from './theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
  delete document.documentElement.dataset.sidebar
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
