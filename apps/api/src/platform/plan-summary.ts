import {
  ADD_ONS,
  addOnOf,
  COUNT_LIMIT_KEYS,
  FEATURE_KEYS,
  featureLabel,
  type MePlan,
  type PlanLimitUse,
  type UpgradeHint,
} from '@vento/shared'
import type { DbOrTx } from '@/db/client'
import { supportContact } from '@/env'
import { isLive, type OrganizationAvailability, type Snapshot } from './availability'
import { LIMIT_USAGE } from './usage'

/**
 * Features released to the organization that it isn't entitled to, each with the lowest plan
 * that includes it (or the add-on). Features in no plan are left out. Owners only.
 */
export function upgradeHints(
  availability: OrganizationAvailability,
  snapshot: Pick<Snapshot, 'latestPlans'>,
): UpgradeHint[] {
  const hints: UpgradeHint[] = []
  for (const key of FEATURE_KEYS) {
    if (!availability.released(key) || availability.entitled(key)) continue
    const addOn = addOnOf(key)
    const availableOn = addOn
      ? `the ${ADD_ONS[addOn].label} add-on`
      : snapshot.latestPlans.find((p) => p.features.has(key))?.planName
    if (availableOn) hints.push({ key, label: featureLabel(key), availableOn })
  }
  return hints
}

async function limitUses(
  db: DbOrTx,
  availability: OrganizationAvailability,
): Promise<PlanLimitUse[]> {
  const keys = COUNT_LIMIT_KEYS.filter((k) => LIMIT_USAGE[k])
  return Promise.all(
    keys.map(async (key) => ({
      key,
      included: availability.countLimit(key),
      used: (await LIMIT_USAGE[key]?.(db, availability.organizationId)) ?? 0,
    })),
  )
}

/** The owner's `me.plan`: plan name, limits with use, trial, hints and the support contact. */
export async function planSummary(
  db: DbOrTx,
  availability: OrganizationAvailability,
  snapshot: Snapshot,
  now = new Date(),
): Promise<MePlan> {
  const limits = await limitUses(db, availability)
  const rows = snapshot.organizations.get(availability.organizationId)
  const overrides = rows?.overrides ?? []
  const trial = rows?.trials?.find((t) => t.expiresAt > now) ?? null
  // What the trial adds that the plan doesn't: these go when it ends.
  const losing = trial
    ? overrides
        .filter(
          (o) => o.trialId === trial.id && o.kind === 'feature' && o.enabled && isLive(o, now),
        )
        .flatMap((o) => FEATURE_KEYS.filter((k) => k === o.key && availability.has(k)))
        .filter((k) => !availability.plan?.features.has(k))
        .map(featureLabel)
    : []
  return {
    name: availability.plan?.planName ?? null,
    limits,
    aiBudget: availability.addOns.includes('ai') ? availability.limit('ai_budget') : null,
    trial: trial ? { planName: trial.planName, endsOn: trial.endsOn, losing } : null,
    upgradeHints: upgradeHints(availability, snapshot),
    contact: supportContact(),
  }
}
