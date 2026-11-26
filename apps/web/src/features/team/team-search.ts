import type { ListTeamInput } from '@vento/shared'
import { readJson, writeJson } from '@/lib/storage'

/*
 * The Team page's address: `/settings/team?q=aisha&role=…&show=invited&page=2&open=<row id>`.
 * Hand-written, not zod: route search validation runs in the entry bundle (see `_shell.tsx`).
 */

export type TeamShow = NonNullable<ListTeamInput['show']>

export type TeamSearch = {
  q?: string
  /** A role id. */
  role?: string
  show?: Exclude<TeamShow, 'everyone'>
  page?: number
  /** The row whose sheet is open (member, invitation or removed person). */
  open?: string
}

const SHOWS = new Set<string>(['invited', 'removed'])
const short = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max
    ? value.trim()
    : undefined

export function validateTeamSearch(search: Record<string, unknown>): TeamSearch {
  const page = Number(search.page)
  const show = typeof search.show === 'string' && SHOWS.has(search.show) ? search.show : undefined
  return {
    q: short(search.q, 100),
    role: short(search.role, 64),
    show: show as TeamSearch['show'],
    page: Number.isInteger(page) && page > 1 && page < 10_000 ? page : undefined,
    open: short(search.open, 64),
  }
}

export const TEAM_PAGE_SIZE = 50

/** What the list request sends for an address. The open sheet doesn't change the list. */
export function teamListInput(search: TeamSearch): ListTeamInput {
  return {
    q: search.q,
    roleId: search.role,
    show: search.show ?? 'everyone',
    page: search.page ?? 1,
    pageSize: TEAM_PAGE_SIZE,
  }
}

export function hasFilters(search: TeamSearch): boolean {
  return Boolean(search.q || search.role)
}

/* Role and chip are remembered on this device, per organization; search text and page aren't. */

type Remembered = { role: string | null; show: TeamShow }
const key = (organizationId: string) => `vento.team.filters.${organizationId}`
const isRemembered = (value: unknown): value is Remembered =>
  typeof value === 'object' &&
  value !== null &&
  'show' in value &&
  typeof value.show === 'string' &&
  (value.show === 'everyone' || SHOWS.has(value.show)) &&
  'role' in value &&
  (value.role === null || typeof value.role === 'string')

export function rememberTeamFilters(organizationId: string, search: TeamSearch): void {
  writeJson(key(organizationId), { role: search.role ?? null, show: search.show ?? 'everyone' })
}

/** The remembered filters, when the address has none of its own; null when nothing changes. */
export function restoreTeamFilters(organizationId: string, search: TeamSearch): TeamSearch | null {
  if (search.role || search.show || search.q || search.page || search.open) return null
  const saved = readJson(key(organizationId), isRemembered)
  if (!saved || (saved.role === null && saved.show === 'everyone')) return null
  return {
    role: saved.role ?? undefined,
    show: saved.show === 'everyone' ? undefined : saved.show,
  }
}
