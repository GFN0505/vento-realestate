import type { PermissionModule } from '@vento/shared'
import { isRecord, readJson, removeByPrefix, writeJson } from '@/lib/storage'

/*
 * Pages opened on this device, per person and organization, for ⌘K "Recently opened" and the
 * 404 page. Cleared on sign-out (decision 9): titles will name buyers once records exist.
 */

export type RecentPage = {
  title: string
  /** Path and search, e.g. "/sales?entity=…". */
  href: string
  /** The module the page belongs to, so it's hidden if the role loses access (decision 12). */
  module: PermissionModule | null
}

const MAX = 5
const prefix = (userId: string) => `vento-recent:${userId}:`
const key = (userId: string, organizationId: string) => `${prefix(userId)}${organizationId}`

function isRecentList(value: unknown): value is RecentPage[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        isRecord(v) &&
        typeof v.title === 'string' &&
        typeof v.href === 'string' &&
        (v.module === null || typeof v.module === 'string'),
    )
  )
}

export function readRecentPages(userId: string, organizationId: string): RecentPage[] {
  return readJson(key(userId, organizationId), isRecentList) ?? []
}

/** Newest first, one entry per path (the newest title and search win), at most five. */
export function recordRecentPage(userId: string, organizationId: string, page: RecentPage) {
  const path = (href: string) => href.split('?')[0]
  const rest = readRecentPages(userId, organizationId).filter(
    (p) => path(p.href) !== path(page.href),
  )
  writeJson(key(userId, organizationId), [page, ...rest].slice(0, MAX))
}

export function clearRecentPages(userId: string) {
  removeByPrefix(prefix(userId))
}
