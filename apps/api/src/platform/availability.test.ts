import {
  type FeatureKey,
  prerequisitesOf,
  RELEASE_GROUPS,
  RELEASE_STAGES,
  type ReleaseGroup,
  type ReleaseStage,
} from '@vento/shared'
import { describe, expect, it } from 'vitest'
import {
  type AddOnRow,
  emptySnapshot,
  type OverrideRow,
  organizationAvailability,
  type PlanVersionInfo,
  type Snapshot,
} from './availability'

const NOW = new Date('2026-12-01T10:00:00Z')
const PAST = new Date('2026-11-30T10:00:00Z')
const ORG = '01936f1e-8b2a-7c3d-9e4f-0000000000aa'

type ReleaseOverride = 'none' | 'on' | 'off' | 'expired_on' | 'cleared_on'
type PlanIncludes = 'yes' | 'no' | 'no_plan'
type AddOnState = 'none' | 'active' | 'cancelled' | 'ended'
type EntitlementOverride = 'none' | 'on' | 'off' | 'expired_on'

type Row = {
  target: FeatureKey
  stage: ReleaseStage
  group: ReleaseGroup
  release: ReleaseOverride
  plan: PlanIncludes
  addOn: AddOnState
  entitlement: EntitlementOverride
  prerequisite: boolean
}

function planVersion(features: FeatureKey[], limits: PlanVersionInfo['limits'] = {}) {
  return {
    id: 'pv-starter-1',
    planId: 'p-starter',
    planKey: 'starter',
    planName: 'Starter',
    sortOrder: 1,
    version: 1,
    features: new Set(features),
    limits,
  } satisfies PlanVersionInfo
}

function override(
  kind: OverrideRow['kind'],
  key: string,
  enabled: boolean,
  expiresAt: Date | null = null,
): OverrideRow {
  return { kind, key, enabled, limitValue: null, expiresAt, trialId: null }
}

/** Builds the snapshot a row describes, the way the loader would (cleared and cancelled rows are never loaded). */
function scenario(row: Row) {
  const stages = new Map<FeatureKey, ReleaseStage>([[row.target, row.stage]])
  const overrides: OverrideRow[] = []
  // Prerequisites: available through stage `on` and a live entitlement, or switched off.
  const prereqs = allPrerequisites(row.target)
  for (const p of prereqs) {
    stages.set(p, row.prerequisite ? 'on' : 'off')
    overrides.push(override('feature', p, true))
  }
  if (row.release === 'on') overrides.push(override('release', row.target, true))
  if (row.release === 'off') overrides.push(override('release', row.target, false))
  if (row.release === 'expired_on') overrides.push(override('release', row.target, true, PAST))
  if (row.entitlement === 'on') overrides.push(override('feature', row.target, true))
  if (row.entitlement === 'off') overrides.push(override('feature', row.target, false))
  if (row.entitlement === 'expired_on') overrides.push(override('feature', row.target, true, PAST))
  const addOns: AddOnRow[] = []
  if (row.addOn === 'active')
    addOns.push({ addOnKey: 'ai', limitIncreases: {}, startsAt: PAST, endsAt: null })
  if (row.addOn === 'ended')
    addOns.push({
      addOnKey: 'ai',
      limitIncreases: {},
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: PAST,
    })
  const pv = planVersion(row.plan === 'yes' ? [row.target] : [])
  const snapshot: Snapshot = {
    ...emptySnapshot(NOW),
    stages,
    planVersions: new Map([[pv.id, pv]]),
    organizations: new Map([[ORG, { overrides, addOns }]]),
  }
  return organizationAvailability(
    snapshot,
    {
      organizationId: ORG,
      releaseGroup: row.group,
      planVersionId: row.plan === 'no_plan' ? null : pv.id,
    },
    NOW,
  )
}

function allPrerequisites(key: FeatureKey): FeatureKey[] {
  return prerequisitesOf(key).flatMap((p) => [p, ...allPrerequisites(p)])
}

/** Written from the spec's four steps, independently of the resolver. */
function oracle(row: Row): boolean {
  let released: boolean
  if (row.stage === 'off') released = false
  else if (row.release === 'on') released = true
  else if (row.release === 'off') released = false
  else
    released =
      row.stage === 'on' ||
      (row.stage === 'pilot' && row.group !== 'standard') ||
      (row.stage === 'internal' && row.group === 'internal')

  let entitled: boolean
  if (row.group === 'internal') entitled = true
  else if (row.entitlement === 'on') entitled = true
  else if (row.entitlement === 'off') entitled = false
  else entitled = row.plan === 'yes' || (row.target.startsWith('ai.') && row.addOn === 'active')

  return released && entitled && row.prerequisite
}

function allRows(): Row[] {
  const rows: Row[] = []
  for (const target of ['sales.commissions', 'ai.payment_matching'] as const)
    for (const stage of RELEASE_STAGES)
      for (const group of RELEASE_GROUPS)
        for (const release of ['none', 'on', 'off', 'expired_on', 'cleared_on'] as const)
          for (const plan of ['yes', 'no', 'no_plan'] as const)
            for (const addOn of ['none', 'active', 'cancelled', 'ended'] as const)
              for (const entitlement of ['none', 'on', 'off', 'expired_on'] as const)
                for (const prerequisite of [true, false])
                  rows.push({
                    target,
                    stage,
                    group,
                    release,
                    plan,
                    addOn,
                    entitlement,
                    prerequisite,
                  })
  return rows
}

const base: Row = {
  target: 'sales.commissions',
  stage: 'on',
  group: 'standard',
  release: 'none',
  plan: 'yes',
  addOn: 'none',
  entitlement: 'none',
  prerequisite: true,
}

// Hand-pinned rows check the oracle itself.
const NAMED: [string, Partial<Row>, boolean][] = [
  ['stage on, in plan', {}, true],
  ['kill switch beats a release override on', { stage: 'off', release: 'on' }, false],
  ['kill switch beats an entitlement override on', { stage: 'off', entitlement: 'on' }, false],
  ['kill switch beats both overrides', { stage: 'off', release: 'on', entitlement: 'on' }, false],
  ['kill switch applies to internal organizations', { stage: 'off', group: 'internal' }, false],
  ['Starter without the feature, stage on', { plan: 'no' }, false],
  [
    'Starter without the feature, live entitlement override',
    { plan: 'no', entitlement: 'on' },
    true,
  ],
  [
    'Starter without the feature, expired override',
    { plan: 'no', entitlement: 'expired_on' },
    false,
  ],
  ['entitlement override off beats the plan', { entitlement: 'off' }, false],
  ['no plan, nothing else', { plan: 'no_plan' }, false],
  ['internal: entitled with no plan', { group: 'internal', plan: 'no_plan' }, true],
  [
    'internal: stage internal reaches it',
    { group: 'internal', stage: 'internal', plan: 'no' },
    true,
  ],
  [
    'internal: entitlement override off is ignored',
    { group: 'internal', entitlement: 'off' },
    true,
  ],
  ['standard: stage internal does not reach it', { stage: 'internal' }, false],
  ['standard: stage pilot does not reach it', { stage: 'pilot' }, false],
  ['pilot: stage pilot reaches it', { stage: 'pilot', group: 'pilot' }, true],
  ['pilot: stage internal does not reach it', { stage: 'internal', group: 'pilot' }, false],
  ['release override on before release', { stage: 'internal', release: 'on' }, true],
  ['release override off holds it back', { release: 'off' }, false],
  [
    'expired release override no longer applies',
    { stage: 'internal', release: 'expired_on' },
    false,
  ],
  [
    'cleared release override no longer applies',
    { stage: 'internal', release: 'cleared_on' },
    false,
  ],
  ['prerequisite unavailable', { prerequisite: false }, false],
  ['prerequisite unavailable even for internal', { prerequisite: false, group: 'internal' }, false],
  ['add-on does not grant a non-add-on feature', { plan: 'no', addOn: 'active' }, false],
  [
    'AI add-on grants an AI feature',
    { target: 'ai.payment_matching', plan: 'no', addOn: 'active' },
    true,
  ],
  [
    'cancelled AI add-on grants nothing',
    { target: 'ai.payment_matching', plan: 'no', addOn: 'cancelled' },
    false,
  ],
  [
    'ended AI add-on grants nothing',
    { target: 'ai.payment_matching', plan: 'no', addOn: 'ended' },
    false,
  ],
  [
    'AI feature, add-on active but kill switch',
    { target: 'ai.payment_matching', stage: 'off', addOn: 'active' },
    false,
  ],
  [
    'AI feature, entitlement override off beats the add-on',
    { target: 'ai.payment_matching', plan: 'no', addOn: 'active', entitlement: 'off' },
    false,
  ],
  [
    'AI feature needs its prerequisite',
    { target: 'ai.payment_matching', addOn: 'active', prerequisite: false },
    false,
  ],
]

describe('availability rule', () => {
  it.each(NAMED)('oracle: %s', (_name, change, expected) => {
    expect(oracle({ ...base, ...change })).toBe(expected)
  })

  it.each(NAMED)('resolver: %s', (_name, change, expected) => {
    const row = { ...base, ...change }
    expect(scenario(row).has(row.target)).toBe(expected)
  })

  it('matches the oracle on every combination', () => {
    const rows = allRows()
    expect(rows.length).toBe(11_520)
    const mismatches = rows.filter((row) => scenario(row).has(row.target) !== oracle(row))
    expect(mismatches.slice(0, 3)).toEqual([])
  })
})

describe('early access', () => {
  it.each([
    ['stage internal, internal organization', { stage: 'internal', group: 'internal' }, true],
    ['stage pilot, pilot organization', { stage: 'pilot', group: 'pilot' }, true],
    ['release override on before release', { stage: 'internal', release: 'on' }, true],
    ['stage on', {}, false],
    ['a trial (entitlement override) at stage on', { plan: 'no', entitlement: 'on' }, false],
  ] as const)('%s → %s', (_name, change, expected) => {
    const row = { ...base, ...change }
    const availability = scenario(row)
    expect(availability.earlyAccess(row.target)).toBe(expected)
    expect(availability.list().find((f) => f.key === row.target)?.earlyAccess).toBe(expected)
  })

  it('is false for an unavailable feature', () => {
    expect(scenario({ ...base, stage: 'internal' }).earlyAccess('sales.commissions')).toBe(false)
  })
})

describe('core features', () => {
  it('are entitled with no plan, once released', () => {
    const snapshot: Snapshot = { ...emptySnapshot(NOW), stages: new Map([['compliance', 'on']]) }
    const a = organizationAvailability(
      snapshot,
      { organizationId: ORG, releaseGroup: 'standard', planVersionId: null },
      NOW,
    )
    expect(a.has('compliance')).toBe(true)
    expect(a.has('compliance.permits')).toBe(false) // still at internal
  })
})

describe('expiry at Lagos midnight', () => {
  // A trial ending on 1 Jan 2027 expires at 00:00 Lagos on 2 Jan, which is 23:00 UTC on 1 Jan.
  const expiresAt = new Date('2027-01-01T23:00:00Z')
  const at = (iso: string) => {
    const snapshot: Snapshot = {
      ...emptySnapshot(NOW),
      stages: new Map([
        ['finance', 'on'],
        ['finance.tax', 'on'],
      ]),
      organizations: new Map([
        [
          ORG,
          {
            overrides: [
              override('feature', 'finance', true, expiresAt),
              override('feature', 'finance.tax', true, expiresAt),
            ],
            addOns: [],
          },
        ],
      ]),
    }
    return organizationAvailability(
      snapshot,
      { organizationId: ORG, releaseGroup: 'standard', planVersionId: null },
      new Date(iso),
    ).has('finance.tax')
  }

  it('still applies at 23:59:59 Lagos', () => {
    expect(at('2027-01-01T22:59:59Z')).toBe(true)
  })

  it('stops applying at 00:00:00 Lagos, with no job', () => {
    expect(at('2027-01-01T23:00:00Z')).toBe(false)
  })
})

describe('limits', () => {
  const pv = planVersion(['land'], { projects: '1.00', entities: '2.00', ai_budget: '0.00' })
  const limitsFor = (
    group: ReleaseGroup,
    rows: { overrides?: OverrideRow[]; addOns?: AddOnRow[] } = {},
    planVersionId: string | null = pv.id,
  ) =>
    organizationAvailability(
      {
        ...emptySnapshot(NOW),
        planVersions: new Map([[pv.id, pv]]),
        organizations: new Map([
          [ORG, { overrides: rows.overrides ?? [], addOns: rows.addOns ?? [] }],
        ]),
      },
      { organizationId: ORG, releaseGroup: group, planVersionId },
      NOW,
    )

  it('reads the plan limit', () => {
    expect(limitsFor('standard').countLimit('entities')).toBe(2)
  })

  it('treats a limit the plan leaves out as unlimited', () => {
    expect(limitsFor('standard').countLimit('members')).toBeNull()
  })

  it('treats no plan as unlimited', () => {
    expect(limitsFor('standard', {}, null).countLimit('entities')).toBeNull()
  })

  it('gives internal organizations no limits', () => {
    expect(limitsFor('internal').countLimit('entities')).toBeNull()
    expect(limitsFor('internal').limit('ai_budget')).toBeNull()
  })

  it('lets a live limit override win, including unlimited', () => {
    const eight = { ...override('limit', 'projects', true), enabled: null, limitValue: '8.00' }
    const unlimited = { ...override('limit', 'entities', true), enabled: null, limitValue: null }
    const a = limitsFor('standard', { overrides: [eight, unlimited] })
    expect(a.countLimit('projects')).toBe(8)
    expect(a.countLimit('entities')).toBeNull()
  })

  it('ignores an expired limit override', () => {
    const expired = {
      ...override('limit', 'projects', true, PAST),
      enabled: null,
      limitValue: '8.00',
    }
    expect(limitsFor('standard', { overrides: [expired] }).countLimit('projects')).toBe(1)
  })

  it('adds active add-on increases to the plan limit', () => {
    const ai: AddOnRow = {
      addOnKey: 'ai',
      limitIncreases: { ai_budget: '150000.00' },
      startsAt: PAST,
      endsAt: null,
    }
    expect(limitsFor('standard', { addOns: [ai] }).limit('ai_budget')).toBe('150000.00')
    expect(limitsFor('standard', { addOns: [{ ...ai, endsAt: PAST }] }).limit('ai_budget')).toBe(
      '0.00',
    )
  })

  it('ignores add-on keys the catalog does not know', () => {
    const unknown: AddOnRow = {
      addOnKey: 'extra_project',
      limitIncreases: { projects: '1.00' },
      startsAt: PAST,
      endsAt: null,
    }
    expect(limitsFor('standard', { addOns: [unknown] }).countLimit('projects')).toBe(1)
  })
})

describe('isolation', () => {
  it("never applies one organization's rows to another", () => {
    const snapshot: Snapshot = {
      ...emptySnapshot(NOW),
      stages: new Map([['land', 'on']]),
      organizations: new Map([
        [ORG, { overrides: [override('feature', 'land', true)], addOns: [] }],
      ]),
    }
    const other = organizationAvailability(
      snapshot,
      {
        organizationId: '01936f1e-8b2a-7c3d-9e4f-0000000000bb',
        releaseGroup: 'standard',
        planVersionId: null,
      },
      NOW,
    )
    expect(other.has('land')).toBe(false)
  })
})
