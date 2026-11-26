import { useSyncExternalStore } from 'react'
import { readItem, writeItem } from '@/lib/storage'

/*
 * Theme and sidebar width are device preferences. index.html applies both before first paint;
 * this module keeps them in step afterwards. Keep the keys and values in sync with index.html
 * (theme.test.ts reads it).
 */

export const THEME_KEY = 'vento-theme'
export const SIDEBAR_KEY = 'vento-sidebar'
export const SIDEBAR_COLLAPSED = 'collapsed'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

const DARK_QUERY = '(prefers-color-scheme: dark)'
const listeners = new Set<() => void>()

function isTheme(value: string | null): value is Theme {
  return value !== null && (THEMES as readonly string[]).includes(value)
}

/** Light unless this device chose otherwise (owner's decision: light is the default). */
export function getTheme(): Theme {
  const stored = readItem(THEME_KEY)
  return isTheme(stored) ? stored : 'light'
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches === true
}

export function resolveTheme(theme: Theme, systemDark = systemIsDark()): 'light' | 'dark' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
}

export function applyTheme(theme: Theme = getTheme()): void {
  const dark = resolveTheme(theme) === 'dark'
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

function emit() {
  for (const listener of listeners) listener()
}

export function setTheme(theme: Theme): void {
  writeItem(THEME_KEY, theme === 'light' ? null : theme)
  applyTheme(theme)
  emit()
}

let watching = false

/** Follows the device while on System, and other tabs when they change the choice. */
function watch() {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.matchMedia?.(DARK_QUERY).addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme('system')
  })
  window.addEventListener('storage', (event) => {
    if (event.key === THEME_KEY) {
      applyTheme()
      emit()
    }
    if (event.key === SIDEBAR_KEY) {
      applySidebar(event.newValue === SIDEBAR_COLLAPSED)
      emitSidebar()
    }
  })
}

function subscribe(listener: () => void) {
  watch()
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => 'light')
}

// Sidebar -----------------------------------------------------------------------------------

const sidebarListeners = new Set<() => void>()

function emitSidebar() {
  for (const listener of sidebarListeners) listener()
}

export function isSidebarCollapsed(): boolean {
  return document.documentElement.dataset.sidebar === SIDEBAR_COLLAPSED
}

function applySidebar(collapsed: boolean) {
  if (collapsed) document.documentElement.dataset.sidebar = SIDEBAR_COLLAPSED
  else delete document.documentElement.dataset.sidebar
}

export function setSidebarCollapsed(collapsed: boolean): void {
  applySidebar(collapsed)
  writeItem(SIDEBAR_KEY, collapsed ? SIDEBAR_COLLAPSED : null)
  emitSidebar()
}

export function toggleSidebar(): void {
  setSidebarCollapsed(!isSidebarCollapsed())
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      watch()
      sidebarListeners.add(listener)
      return () => sidebarListeners.delete(listener)
    },
    isSidebarCollapsed,
    () => false,
  )
}
