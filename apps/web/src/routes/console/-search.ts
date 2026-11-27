/*
 * The console's addresses, validated by hand: route search validation runs in the entry bundle,
 * so no zod and nothing from features/console here (plan §9.1). The `-` prefix keeps this file
 * out of the route tree.
 */

type Raw = Record<string, unknown>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const KEY = /^[a-z][a-z0-9_.]{1,60}$/

function text(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
    ? value.trim()
    : undefined
}
function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return options.find((option) => option === value)
}
function page(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isInteger(n) && n > 1 && n < 10_000 ? n : undefined
}
/** An address id or plan key that can't exist: the page is the 404 and nothing is requested. */
export const isOrganizationId = (value: string) => UUID.test(value)
export const isPlanKey = (value: string) => /^[a-z][a-z0-9_]{1,30}$/.test(value)

const uuid = (value: unknown) => (typeof value === 'string' && UUID.test(value) ? value : undefined)
const key = (value: unknown) => (typeof value === 'string' && KEY.test(value) ? value : undefined)
const date = (value: unknown) => (typeof value === 'string' && DATE.test(value) ? value : undefined)

// ── Organizations ────────────────────────────────────────────────────────────

export const ORGANIZATION_FILTERS = ['trial', 'pilot', 'internal', 'over_limit'] as const
export type OrganizationsSearch = {
  filter?: (typeof ORGANIZATION_FILTERS)[number]
  q?: string
  page?: number
}
export const validateOrganizationsSearch = (s: Raw): OrganizationsSearch => ({
  filter: oneOf(s.filter, ORGANIZATION_FILTERS),
  q: text(s.q, 100),
  page: page(s.page),
})

export const CHANGES = [
  'plan',
  'start-trial',
  'end-trial',
  'add-ai',
  'ai-budget',
  'remove-ai',
  'group',
  'override',
  'clear-override',
] as const
export type ChangeName = (typeof CHANGES)[number]
export type OrganizationSearch = {
  /** The open change sheet. */
  change?: ChangeName
  /** Prefill for `override` / target of `clear-override`. */
  kind?: 'release' | 'feature' | 'limit'
  key?: string
  /** Features card: available or not, and a name to find. */
  show?: 'available' | 'unavailable'
  find?: string
  /** The "ended" overrides list is open, on this page. */
  ended?: number
}
export const validateOrganizationSearch = (s: Raw): OrganizationSearch => {
  const ended = Number(s.ended)
  return {
    change: oneOf(s.change, CHANGES),
    kind: oneOf(s.kind, ['release', 'feature', 'limit'] as const),
    key: key(s.key),
    show: oneOf(s.show, ['available', 'unavailable'] as const),
    find: text(s.find, 60),
    ended: Number.isInteger(ended) && ended >= 1 && ended < 10_000 ? ended : undefined,
  }
}

// ── Releases ─────────────────────────────────────────────────────────────────

export const RELEASE_FILTERS = ['off', 'internal', 'pilot', 'on', 'in_no_plan'] as const
export const STAGES = ['off', 'internal', 'pilot', 'on'] as const
export type ReleasesSearch = { filter?: (typeof RELEASE_FILTERS)[number] }
export const validateReleasesSearch = (s: Raw): ReleasesSearch => ({
  filter: oneOf(s.filter, RELEASE_FILTERS),
})
/** `move`: the stage whose confirm is open (the kill switch is `move=off`). */
export type ReleaseSearch = { move?: (typeof STAGES)[number] }
export const validateReleaseSearch = (s: Raw): ReleaseSearch => ({ move: oneOf(s.move, STAGES) })

// ── Plans ────────────────────────────────────────────────────────────────────

/** `publish`: the Publish sheet is open (`new` for a new plan on the list). */
export type PlansSearch = { publish?: 'new' }
export const validatePlansSearch = (s: Raw): PlansSearch => ({
  publish: oneOf(s.publish, ['new'] as const),
})
export type PlanSearch = { publish?: 'version' }
export const validatePlanSearch = (s: Raw): PlanSearch => ({
  publish: oneOf(s.publish, ['version'] as const),
})

// ── Super-admins and Activity ────────────────────────────────────────────────

/**
 * `invite`: the Invite sheet is open. `remove` / `reset`: the person (user id) whose confirm is
 * open. `withdraw`: the staff invitation whose confirm is open.
 */
export type SuperAdminsSearch = {
  invite?: true
  remove?: string
  reset?: string
  withdraw?: string
}
export const validateSuperAdminsSearch = (s: Raw): SuperAdminsSearch => ({
  invite: s.invite === true || s.invite === 'true' ? true : undefined,
  remove: uuid(s.remove),
  reset: uuid(s.reset),
  withdraw: uuid(s.withdraw),
})

export const ACTIVITY_KINDS = [
  'release',
  'plan',
  'trial',
  'add_on',
  'override',
  'super_admin',
] as const
export type ActivitySearch = {
  person?: string
  organization?: string
  feature?: string
  kind?: (typeof ACTIVITY_KINDS)[number]
  from?: string
  to?: string
  page?: number
}
export const validateActivitySearch = (s: Raw): ActivitySearch => ({
  person: uuid(s.person),
  organization: uuid(s.organization),
  feature: key(s.feature),
  kind: oneOf(s.kind, ACTIVITY_KINDS),
  from: date(s.from),
  to: date(s.to),
  page: page(s.page),
})
