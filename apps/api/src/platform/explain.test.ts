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
import { explainFeature } from './explain'

// The same truth table as availability.test.ts: the explainer must agree with `has()` on every row.

const NOW = new Date('2026-12-01T10:00:00Z')
const PAST = new Date('2026-11-30T10:00:00Z')
const ORG = '01936f1e-8b2a-7c3d-9e4f-0000000000aa'

type Row = {
  target: FeatureKey
  stage: ReleaseStage
  group: ReleaseGroup
  release: 'none' | 'on' | 'off' | 'expired_on'
  plan: 'yes' | 'no' | 'no_plan'
  addOn: 'none' | 'active' | 'ended'
  entitlement: 'none' | 'on' | 'off' | 'expired_on'
  prerequisite: boolean
  trial?: boolean
}

const override = (
  kind: OverrideRow['kind'],
  key: string,
  enabled: boolean,
  expiresAt: Date | null = null,
  trialId: string | null = null,
): OverrideRow => ({ kind, key, enabled, limitValue: null, expiresAt, trialId })

const plan = (name: string, id: string, features: FeatureKey[]): PlanVersionInfo => ({
  id,
  planId: `p-${id}`,
  planKey: name.toLowerCase(),
  planName: name,
  sortOrder: id === 'pv-starter' ? 1 : 2,
  version: 1,
  features: new Set(features),
  limits: {},
})

function allPrerequisites(key: FeatureKey): FeatureKey[] {
  return prerequisitesOf(key).flatMap((p) => [p, ...allPrerequisites(p)])
}

function scenario(row: Row) {
  const stages = new Map<FeatureKey, ReleaseStage>([[row.target, row.stage]])
  const overrides: OverrideRow[] = []
  for (const p of allPrerequisites(row.target)) {
    stages.set(p, row.prerequisite ? 'on' : 'off')
    overrides.push(override('feature', p, true))
  }
  if (row.release === 'on') overrides.push(override('release', row.target, true))
  if (row.release === 'off') overrides.push(override('release', row.target, false))
  if (row.release === 'expired_on') overrides.push(override('release', row.target, true, PAST))
  const trialId = row.trial ? 'trial-1' : null
  if (row.entitlement === 'on') {
    overrides.push(override('feature', row.target, true, null, trialId))
  }
  if (row.entitlement === 'off') overrides.push(override('feature', row.target, false))
  if (row.entitlement === 'expired_on') overrides.push(override('feature', row.target, true, PAST))
  const addOns: AddOnRow[] = []
  if (row.addOn === 'active')
    addOns.push({ addOnKey: 'ai', limitIncreases: {}, startsAt: PAST, endsAt: null })
  if (row.addOn === 'ended')
    addOns.push({ addOnKey: 'ai', limitIncreases: {}, startsAt: new Date(0), endsAt: PAST })
  const starter = plan('Starter', 'pv-starter', row.plan === 'yes' ? [row.target] : [])
  const growth = plan('Growth', 'pv-growth', [row.target])
  const trials = trialId
    ? [{ id: trialId, planName: 'Enterprise', endsOn: '2027-01-02', expiresAt: NOW }]
    : []
  const snapshot: Snapshot = {
    ...emptySnapshot(NOW),
    stages,
    planVersions: new Map([
      [starter.id, starter],
      [growth.id, growth],
    ]),
    latestPlans: [starter, growth].filter((p) => p.features.has(row.target)),
    organizations: new Map([[ORG, { overrides, addOns, trials }]]),
  }
  const org = {
    organizationId: ORG,
    releaseGroup: row.group,
    planVersionId: row.plan === 'no_plan' ? null : starter.id,
  }
  return { snapshot, org }
}

function allRows(): Row[] {
  const rows: Row[] = []
  for (const target of ['sales.commissions', 'ai.payment_matching'] as const)
    for (const stage of RELEASE_STAGES)
      for (const group of RELEASE_GROUPS)
        for (const release of ['none', 'on', 'off', 'expired_on'] as const)
          for (const plan of ['yes', 'no', 'no_plan'] as const)
            for (const addOn of ['none', 'active', 'ended'] as const)
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

function explain(row: Partial<Row>) {
  const { snapshot, org } = scenario({ ...base, ...row })
  return explainFeature(snapshot, org, row.target ?? base.target, NOW)
}

describe('explainFeature', () => {
  it('agrees with availability on every row of the truth table', () => {
    for (const row of allRows()) {
      const { snapshot, org } = scenario(row)
      const has = organizationAvailability(snapshot, org, NOW).has(row.target)
      const { available, reason } = explainFeature(snapshot, org, row.target, NOW)
      expect({ row, available }).toEqual({ row, available: has })
      expect(reason.length).toBeGreaterThan(0)
    }
  })

  it.each<[string, Partial<Row>, string]>([
    ['the kill switch', { stage: 'off', release: 'on' }, 'Off for everyone'],
    [
      'not released to the group',
      { stage: 'internal' },
      'At internal; this organization is standard',
    ],
    ['not in the plan', { plan: 'no' }, 'Not in Starter; in Growth'],
    ['an add-on feature', { target: 'ai.payment_matching', plan: 'no' }, 'With the AI add-on'],
    ['a missing prerequisite', { prerequisite: false }, 'Needs Sales'],
    ['a release override', { stage: 'pilot', release: 'on' }, 'Released through an override'],
    [
      'a trial',
      { plan: 'no', entitlement: 'on', trial: true },
      'From the Enterprise trial (ends 2 Jan 2027)',
    ],
    ['early access', { stage: 'pilot', group: 'pilot' }, 'Early access (pilot)'],
    ['an internal organization', { group: 'internal', plan: 'no_plan' }, 'Internal organization'],
    ['the plan', {}, 'In Starter'],
  ])('names %s', (_name, row, reason) => {
    expect(explain(row).reason).toBe(reason)
  })
})
