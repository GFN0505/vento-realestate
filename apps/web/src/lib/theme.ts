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

// Sidebar width --------------------------------------------------------------------------------
// The person drags the sidebar edge (desktop). index.html applies the stored width before first
// paint; keep these values in sync with it (theme.test.ts reads both).

export const SIDEBAR_WIDTH_KEY = 'vento-sidebar-width'
export const SIDEBAR_WIDTH = { min: 220, max: 320, default: 256 } as const
/** Dragged narrower than this, the sidebar snaps to icons (like Linear). */
export const SIDEBAR_COLLAPSE_BELOW = 180
const STEP = 16
const BIG_STEP = 48

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH.default
  return Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)))
}

/** Where a drag to `x` (px from the sidebar's left edge) leaves the sidebar. */
export function widthFromDrag(x: number): { collapsed: boolean; width: number } {
  if (x < SIDEBAR_COLLAPSE_BELOW) return { collapsed: true, width: SIDEBAR_WIDTH.min }
  return { collapsed: false, width: clampSidebarWidth(x) }
}

/** The width after a key press on the handle, or null if the key isn't a resize key. */
export function widthFromKey(width: number, key: string, shift: boolean): number | null {
  const step = shift ? BIG_STEP : STEP
  if (key === 'ArrowLeft') return clampSidebarWidth(width - step)
  if (key === 'ArrowRight') return clampSidebarWidth(width + step)
  if (key === 'Home') return SIDEBAR_WIDTH.min
  if (key === 'End') return SIDEBAR_WIDTH.max
  return null
}

/** The stored width, or the default when missing or out of range. */
export function storedSidebarWidth(): number {
  const value = Number(readItem(SIDEBAR_WIDTH_KEY))
  return value >= SIDEBAR_WIDTH.min && value <= SIDEBAR_WIDTH.max ? value : SIDEBAR_WIDTH.default
}

/** Live while dragging: only the CSS variable changes, so React doesn't re-render per frame. */
export function previewSidebarWidth(width: number): void {
  document.documentElement.style.setProperty('--sidebar-open-width', `${width}px`)
}

/** Commit a width: apply and remember it on this device (the default isn't stored). */
export function setSidebarWidth(width: number): void {
  const next = clampSidebarWidth(width)
  previewSidebarWidth(next)
  writeItem(SIDEBAR_WIDTH_KEY, next === SIDEBAR_WIDTH.default ? null : String(next))
}
