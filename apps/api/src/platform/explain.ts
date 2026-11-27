import {
  ADD_ONS,
  addOnOf,
  type FeatureKey,
  featureLabel,
  isCoreFeature,
  prerequisitesOf,
} from '@vento/shared'
import { formatDate } from '@/lib/format'
import {
  isLive,
  type OrganizationPlanRef,
  type OverrideRow,
  organizationAvailability,
  type Snapshot,
  stageOf,
} from './availability'
import { formatIsoDate } from './operations/common'

// Why a feature is or isn't available to one organization (admin-console plan §9.7), in the
// availability rule's own order. `available` is always `has(key)`: a test checks every row of the
// availability truth table.

export type FeatureExplanation = { available: boolean; reason: string }

function andList(names: readonly string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

function liveOverride(
  snapshot: Snapshot,
  organizationId: string,
  kind: OverrideRow['kind'],
  key: string,
  now: Date,
): OverrideRow | undefined {
  return snapshot.organizations
    .get(organizationId)
    ?.overrides.find((o) => o.kind === kind && o.key === key && isLive(o, now))
}

const untilText = (o: OverrideRow) => (o.expiresAt ? ` until ${formatDate(o.expiresAt)}` : '')

export function explainFeature(
  snapshot: Snapshot,
  org: OrganizationPlanRef,
  key: FeatureKey,
  now: Date,
): FeatureExplanation {
  const a = organizationAvailability(snapshot, org, now)
  const available = a.has(key)
  const stage = stageOf(snapshot, key)
  const release = liveOverride(snapshot, org.organizationId, 'release', key, now)
  const entitlement = liveOverride(snapshot, org.organizationId, 'feature', key, now)
  const addOn = addOnOf(key)

  if (!available) {
    if (stage === 'off') return { available, reason: 'Off for everyone' }
    if (!a.released(key)) {
      if (release && !release.enabled) {
        return { available, reason: `Held back by an override${untilText(release)}` }
      }
      return { available, reason: `At ${stage}; this organization is ${org.releaseGroup}` }
    }
    if (!a.entitled(key)) {
      if (entitlement && !entitlement.enabled) {
        return { available, reason: `Switched off by an override${untilText(entitlement)}` }
      }
      if (addOn) return { available, reason: `With the ${ADD_ONS[addOn].label} add-on` }
      const holders = snapshot.latestPlans.filter((p) => p.features.has(key)).map((p) => p.planName)
      const here = a.plan ? `Not in ${a.plan.planName}` : 'No plan'
      return {
        available,
        reason: holders.length ? `${here}; in ${andList(holders)}` : `${here}; in no plan`,
      }
    }
    const missing = prerequisitesOf(key).filter((p) => !a.has(p))
    return { available, reason: `Needs ${andList(missing.map(featureLabel))}` }
  }

  if (release?.enabled && stage !== 'on') {
    return { available, reason: `Released through an override${untilText(release)}` }
  }
  if (isCoreFeature(key)) return { available, reason: 'Core: in every plan' }
  if (entitlement?.enabled && !a.internal) {
    const trial = entitlement.trialId
      ? snapshot.organizations
          .get(org.organizationId)
          ?.trials?.find((t) => t.id === entitlement.trialId)
      : undefined
    if (trial) {
      return {
        available,
        reason: `From the ${trial.planName} trial (ends ${formatIsoDate(trial.endsOn)})`,
      }
    }
    return { available, reason: `Added through an override${untilText(entitlement)}` }
  }
  if (stage !== 'on') return { available, reason: `Early access (${stage})` }
  if (a.internal) return { available, reason: 'Internal organization' }
  if (a.plan?.features.has(key)) return { available, reason: `In ${a.plan.planName}` }
  if (addOn) return { available, reason: `With the ${ADD_ONS[addOn].label} add-on` }
  return { available, reason: 'Available' }
}
