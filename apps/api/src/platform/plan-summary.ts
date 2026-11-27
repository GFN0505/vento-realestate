import {
  ADD_ONS,
  addOnOf,
  COUNT_LIMIT_KEYS,
  FEATURE_KEYS,
  featureLabel,
  type MePlan,
  type PlanLimitUse,
  prerequisitesOf,
  type UpgradeHint,
} from '@vento/shared'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { supportContact } from '@/env'
import {
  isLive,
  type OrganizationAvailability,
  type OverrideRow,
  type Snapshot,
} from './availability'
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
    // Buying it wouldn't help while something it needs isn't available here either.
    if (!prerequisitesOf(key).every((p) => availability.has(p))) continue
    const addOn = addOnOf(key)
    const availableOn = addOn
      ? `the ${ADD_ONS[addOn].label} add-on`
      : snapshot.latestPlans.find((p) => p.features.has(key))?.planName
    if (availableOn) hints.push({ key, label: featureLabel(key), availableOn })
  }
  return hints
}

/**
 * Labels of what a trial adds on top of the plan and that the organization has now: what goes
 * when it ends. One rule for `me` and the trial emails.
 */
export function trialLosing(
  availability: OrganizationAvailability,
  overrides: readonly OverrideRow[],
  trialId: string,
  now: Date,
): string[] {
  const keys = new Set(
    overrides
      .filter((o) => o.trialId === trialId && o.kind === 'feature' && o.enabled && isLive(o, now))
      .map((o) => o.key),
  )
  return FEATURE_KEYS.filter(
    (k) => keys.has(k) && availability.has(k) && !availability.plan?.features.has(k),
  ).map(featureLabel)
}

export async function limitUses(
  db: DbOrTx,
  availability: OrganizationAvailability,
): Promise<PlanLimitUse[]> {
  const keys = COUNT_LIMIT_KEYS.filter((k) => LIMIT_USAGE[k])
  const used = await runQueries(
    db,
    keys.map((key) => async () => (await LIMIT_USAGE[key]?.(db, availability.organizationId)) ?? 0),
  )
  return keys.map((key, i) => ({ key, included: availability.countLimit(key), used: used[i] ?? 0 }))
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
  const losing = trial ? trialLosing(availability, overrides, trial.id, now) : []
  return {
    name: availability.plan?.planName ?? null,
    limits,
    aiBudget: availability.addOns.includes('ai') ? availability.limit('ai_budget') : null,
    trial: trial ? { planName: trial.planName, endsOn: trial.endsOn, losing } : null,
    upgradeHints: upgradeHints(availability, snapshot),
    contact: supportContact(),
  }
}
