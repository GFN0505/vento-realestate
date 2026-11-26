import {
  type AddOnKey,
  type AvailableFeature,
  addOnOf,
  type CountLimitKey,
  Decimal,
  FEATURE_KEYS,
  type FeatureKey,
  isAddOnKey,
  isCoreFeature,
  type LimitKey,
  prerequisitesOf,
  type ReleaseGroup,
  type ReleaseStage,
} from '@vento/shared'

// The availability rule (docs/specs/feature-flags.md, plan §2). Pure: no database, no clock.

export type OverrideKind = 'release' | 'feature' | 'limit'

/** An override row not yet cleared. Whether it's live is decided at read time. */
export type OverrideRow = {
  kind: OverrideKind
  key: string
  enabled: boolean | null
  /** Decimal string; null = unlimited (limit overrides only). */
  limitValue: string | null
  expiresAt: Date | null
  trialId: string | null
}

/** An add-on not cancelled. Whether it's active is decided at read time. */
export type AddOnRow = {
  addOnKey: string
  /** `{ ai_budget: "150000.00" }`. */
  limitIncreases: Partial<Record<LimitKey, string>>
  startsAt: Date
  endsAt: Date | null
}

export type PlanVersionInfo = {
  id: string
  planId: string
  planKey: string
  planName: string
  sortOrder: number
  version: number
  /** Catalog keys only; unknown keys from data are dropped on load. */
  features: ReadonlySet<FeatureKey>
  /** Decimal strings; a missing key = unlimited. */
  limits: Partial<Record<LimitKey, string>>
}

/** A trial not cancelled. Its overrides carry its id and expiry. */
export type TrialRow = {
  id: string
  planName: string
  /** Last day, Lagos date. */
  endsOn: string
  expiresAt: Date
}

export type OrganizationRows = {
  overrides: readonly OverrideRow[]
  addOns: readonly AddOnRow[]
  trials?: readonly TrialRow[]
}

/** Everything a request needs to decide availability, held in memory on each API server. */
export type Snapshot = {
  /** No entry = `internal` (a new flag starts there). */
  stages: ReadonlyMap<FeatureKey, ReleaseStage>
  planVersions: ReadonlyMap<string, PlanVersionInfo>
  /** The latest version of each plan that isn't archived, lowest sort order first (for hints). */
  latestPlans: readonly PlanVersionInfo[]
  /** Only organizations with an override or add-on row. */
  organizations: ReadonlyMap<string, OrganizationRows>
  loadedAt: Date
}

/** The organization's own row (from the membership query): release group and plan version. */
export type OrganizationPlanRef = {
  organizationId: string
  releaseGroup: ReleaseGroup
  planVersionId: string | null
}

export type OrganizationAvailability = {
  readonly organizationId: string
  readonly releaseGroup: ReleaseGroup
  readonly internal: boolean
  /** The organization's plan version, or null. */
  readonly plan: PlanVersionInfo | null
  /** Add-ons active now. */
  readonly addOns: readonly AddOnKey[]
  /** Released and entitled, with every prerequisite available. */
  has(key: FeatureKey): boolean
  released(key: FeatureKey): boolean
  entitled(key: FeatureKey): boolean
  /** Available through stage internal or pilot, or a release override (not stage `on`). */
  earlyAccess(key: FeatureKey): boolean
  /** Decimal string, or null for unlimited. */
  limit(key: LimitKey): string | null
  /** A count limit as an integer, or null for unlimited. */
  countLimit(key: CountLimitKey): number | null
  /** Available features with their early-access flag, in catalog order. */
  list(): AvailableFeature[]
}

const EMPTY_ROWS: OrganizationRows = { overrides: [], addOns: [] }

export function isLive(o: Pick<OverrideRow, 'expiresAt'>, now: Date): boolean {
  return o.expiresAt === null || o.expiresAt > now
}

export function isActiveAddOn(a: Pick<AddOnRow, 'startsAt' | 'endsAt'>, now: Date): boolean {
  return a.startsAt <= now && (a.endsAt === null || a.endsAt > now)
}

/** Whether a stage reaches a release group: on → all, pilot → pilot and internal, internal → internal. */
export function stageReaches(stage: ReleaseStage, group: ReleaseGroup): boolean {
  if (stage === 'on') return true
  if (stage === 'pilot') return group === 'pilot' || group === 'internal'
  if (stage === 'internal') return group === 'internal'
  return false
}

export function stageOf(snapshot: Pick<Snapshot, 'stages'>, key: FeatureKey): ReleaseStage {
  return snapshot.stages.get(key) ?? 'internal'
}

function liveOverride(
  rows: OrganizationRows,
  kind: OverrideKind,
  key: string,
  now: Date,
): OverrideRow | undefined {
  return rows.overrides.find((o) => o.kind === kind && o.key === key && isLive(o, now))
}

/**
 * Availability for one organization at `now`. Evaluates lazily with a memo per key, so a
 * request that checks one feature costs a few map lookups.
 */
export function organizationAvailability(
  snapshot: Snapshot,
  org: OrganizationPlanRef,
  now: Date,
): OrganizationAvailability {
  const rows = snapshot.organizations.get(org.organizationId) ?? EMPTY_ROWS
  const internal = org.releaseGroup === 'internal'
  const plan = org.planVersionId ? (snapshot.planVersions.get(org.planVersionId) ?? null) : null
  const activeAddOns = rows.addOns.filter((a) => isAddOnKey(a.addOnKey) && isActiveAddOn(a, now))
  const memo = new Map<FeatureKey, boolean>()

  const released = (key: FeatureKey): boolean => {
    const stage = stageOf(snapshot, key)
    // Kill switch: beats every override and every plan.
    if (stage === 'off') return false
    const override = liveOverride(rows, 'release', key, now)
    if (override) return override.enabled === true
    return stageReaches(stage, org.releaseGroup)
  }

  const entitled = (key: FeatureKey): boolean => {
    if (isCoreFeature(key) || internal) return true
    const override = liveOverride(rows, 'feature', key, now)
    if (override) return override.enabled === true
    if (plan?.features.has(key)) return true
    const addOn = addOnOf(key)
    return addOn !== undefined && activeAddOns.some((a) => a.addOnKey === addOn)
  }

  const has = (key: FeatureKey): boolean => {
    const known = memo.get(key)
    if (known !== undefined) return known
    // Guard against a cycle (the catalog test makes one impossible): treat as unavailable.
    memo.set(key, false)
    const result = released(key) && entitled(key) && prerequisitesOf(key).every((p) => has(p))
    memo.set(key, result)
    return result
  }

  const limit = (key: LimitKey): string | null => {
    if (internal) return null
    const override = liveOverride(rows, 'limit', key, now)
    if (override) return override.limitValue
    const base = plan?.limits[key]
    if (base === undefined) return null
    const total = activeAddOns.reduce((sum, a) => {
      const increase = a.limitIncreases[key]
      return increase === undefined ? sum : sum.plus(increase)
    }, new Decimal(base))
    return total.toFixed(2)
  }

  return {
    organizationId: org.organizationId,
    releaseGroup: org.releaseGroup,
    internal,
    plan,
    addOns: activeAddOns.map((a) => a.addOnKey as AddOnKey),
    has,
    released,
    entitled,
    earlyAccess: (key) => has(key) && stageOf(snapshot, key) !== 'on',
    limit,
    countLimit: (key) => {
      const value = limit(key)
      return value === null ? null : new Decimal(value).floor().toNumber()
    },
    list: () =>
      FEATURE_KEYS.filter(has).map((key) => ({
        key,
        earlyAccess: stageOf(snapshot, key) !== 'on',
      })),
  }
}

/** An empty snapshot: every flag at `internal`, no plans. */
export function emptySnapshot(now = new Date()): Snapshot {
  return {
    stages: new Map(),
    planVersions: new Map(),
    latestPlans: [],
    organizations: new Map(),
    loadedAt: now,
  }
}
