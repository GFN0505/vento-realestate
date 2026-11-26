import { useSyncExternalStore } from 'react'
import { isRecord, readJson, writeJson } from '@/lib/storage'

/*
 * Preview as role (owners and admins): the navigation, tabs and Home become another role's.
 * Kept per tab in sessionStorage, so a reload keeps it and closing the tab ends it. It never
 * reaches the server: every request still runs with the person's own access.
 */

export type PreviewRole = { organizationId: string; roleId: string }

const KEY = 'vento-preview'
const listeners = new Set<() => void>()

function isPreview(value: unknown): value is PreviewRole {
  return (
    isRecord(value) && typeof value.organizationId === 'string' && typeof value.roleId === 'string'
  )
}

let current: PreviewRole | null = readJson(KEY, isPreview, 'session')

function set(next: PreviewRole | null) {
  current = next
  writeJson(KEY, next, 'session')
  for (const listener of listeners) listener()
}

/** The preview for this organization, if any. One stored for another organization is ignored. */
export function getPreview(organizationId: string | null | undefined): PreviewRole | null {
  return current && current.organizationId === organizationId ? current : null
}

export function startPreview(organizationId: string, roleId: string) {
  set({ organizationId, roleId })
}

export function clearPreview() {
  if (current) set(null)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePreview(organizationId: string | null | undefined): PreviewRole | null {
  const stored = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
  return stored && stored.organizationId === organizationId ? stored : null
}

/** Test helper. */
export function resetPreviewForTests() {
  current = null
}
