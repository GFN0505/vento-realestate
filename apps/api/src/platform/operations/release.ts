import {
  addOnOf,
  type FeatureKey,
  featureLabel,
  isCoreFeature,
  prerequisitesOf,
  type ReleaseGroup,
  type ReleaseStage,
} from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  featureReleases,
  organizationOverrides,
  organizationPlans,
  organizations,
} from '@/db/schema'
import { organizationAvailability, type Snapshot, stageOf } from '../availability'
import { CommandError } from '../command-error'
import {
  type PlatformActor,
  recordOrganizationNotice,
  recordPlatformAudit,
} from '../platform-audit'
import { loadOrganizationPlan, loadSnapshot } from '../snapshot'
import { FEATURE_RECORD_COUNTERS } from '../usage'
import {
  clearOverride,
  formatIsoDate,
  labels,
  lockOrganizationPlan,
  type OrganizationRef,
  untilToExpiry,
} from './common'

type OrgPlanRow = OrganizationRef & {
  releaseGroup: ReleaseGroup
  planVersionId: string | null
}

export async function allOrganizationPlans(db: DbOrTx): Promise<OrgPlanRow[]> {
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      releaseGroup: organizationPlans.releaseGroup,
      planVersionId: organizationPlans.planVersionId,
    })
    .from(organizations)
    .leftJoin(organizationPlans, eq(organizationPlans.organizationId, organizations.id))
  return rows.map((r) => ({
    ...r,
    releaseGroup: r.releaseGroup ?? 'standard',
    planVersionId: r.planVersionId ?? null,
  }))
}

export function holders(
  snapshot: Snapshot,
  orgs: readonly OrgPlanRow[],
  key: FeatureKey,
  now: Date,
) {
  return orgs.filter((o) =>
    organizationAvailability(snapshot, { organizationId: o.id, ...o }, now).has(key),
  )
}

const byGroup = (orgs: readonly OrgPlanRow[]) => {
  const parts = (['internal', 'pilot', 'standard'] as const)
    .map((g) => [g, orgs.filter((o) => o.releaseGroup === g).length] as const)
    .filter(([, n]) => n > 0)
    .map(([g, n]) => `${n} ${g}`)
  return parts.length ? ` (${parts.join(', ')})` : ''
}

const organizationsWord = (n: number) => `${n} ${n === 1 ? 'organization' : 'organizations'}`

/** What a stage change would do, for the confirm step: who gains or loses it, warnings. */
export async function previewStage(
  db: DbOrTx,
  key: FeatureKey,
  stage: ReleaseStage,
  now = new Date(),
): Promise<{ current: ReleaseStage; lines: string[] }> {
  const [snapshot, orgs] = await Promise.all([loadSnapshot(db, { now }), allOrganizationPlans(db)])
  const label = featureLabel(key)
  const current = stageOf(snapshot, key)
  const before = holders(snapshot, orgs, key, now)
  const stages = new Map(snapshot.stages)
  stages.set(key, stage)
  const after = holders({ ...snapshot, stages }, orgs, key, now)
  const lines =
    stage === 'off'
      ? [
          `${label} will be switched off for everyone (${organizationsWord(before.length)} have it now).`,
        ]
      : [`${label} will be available to ${organizationsWord(after.length)}${byGroup(after)}.`]
  const inAnyPlan =
    isCoreFeature(key) ||
    addOnOf(key) !== undefined ||
    snapshot.latestPlans.some((p) => p.features.has(key))
  if (stage === 'on' && !inAnyPlan) {
    lines.push(`${label} is in no plan, so standard organizations still won't have it.`)
  }
  const losing = before.filter((o) => !after.some((a) => a.id === o.id))
  const counter = FEATURE_RECORD_COUNTERS[key]
  for (const org of losing) {
    const n = counter ? await counter(db, org.id) : 0
    if (n > 0) {
      lines.push(`${org.name} has ${n} records in ${label}. Its members will stop seeing them.`)
    }
  }
  return { current, lines }
}

export async function setStage(
  db: DbOrTx,
  actor: PlatformActor,
  input: { key: FeatureKey; stage: ReleaseStage; reason: string },
): Promise<string> {
  const label = featureLabel(input.key)
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ stage: featureReleases.stage })
      .from(featureReleases)
      .where(eq(featureReleases.featureKey, input.key))
      .for('update')
    await tx
      .insert(featureReleases)
      .values({
        featureKey: input.key,
        stage: input.stage,
        reason: input.reason,
        changedByUserId: actor.userId,
      })
      .onConflictDoUpdate({
        target: featureReleases.featureKey,
        set: { stage: input.stage, reason: input.reason, changedByUserId: actor.userId },
      })
    await recordPlatformAudit(tx, {
      actor,
      action: 'release.stage_changed',
      targetType: 'feature',
      targetKey: input.key,
      before: { stage: existing?.stage ?? 'internal' },
      after: { stage: input.stage },
      reason: input.reason,
    })
  })
  return input.stage === 'off'
    ? `${label} is now off for everyone, including overrides and plans.`
    : `${label} is now at ${input.stage}. Takes effect within 30 seconds.`
}

export async function setReleaseGroup(
  db: DbOrTx,
  actor: PlatformActor,
  input: { organization: OrganizationRef; group: ReleaseGroup; reason: string },
): Promise<string> {
  const { organization: org } = input
  await db.transaction(async (tx) => {
    const current = await lockOrganizationPlan(tx, org.id)
    if (current.releaseGroup === input.group) {
      throw new CommandError(`${org.name} is already in the ${input.group} group.`)
    }
    await tx
      .update(organizationPlans)
      .set({ releaseGroup: input.group })
      .where(eq(organizationPlans.organizationId, org.id))
    await recordPlatformAudit(tx, {
      actor,
      action: 'release.group_changed',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      before: { releaseGroup: current.releaseGroup },
      after: { releaseGroup: input.group },
      reason: input.reason,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'release.group_changed',
      message:
        input.group === 'standard'
          ? "Your organization's early access ended"
          : 'Vento gave your organization early access to new features',
      before: { releaseGroup: current.releaseGroup },
      after: { releaseGroup: input.group },
    })
  })
  return `${org.name} is now in the ${input.group} group. Takes effect on its next request.`
}

/** Prerequisites the organization doesn't have, for "Buyer portal needs Sales and Finance, …". */
export async function missingPrerequisites(
  db: DbOrTx,
  org: OrganizationRef,
  key: FeatureKey,
  now = new Date(),
): Promise<string | null> {
  const [snapshot, plan] = await Promise.all([
    loadSnapshot(db, { organizationId: org.id, now }),
    loadOrganizationPlan(db, org.id),
  ])
  const availability = organizationAvailability(snapshot, { organizationId: org.id, ...plan }, now)
  const missing = prerequisitesOf(key).filter((p) => !availability.has(p))
  if (missing.length === 0) return null
  return `${featureLabel(key)} needs ${labels(missing)}, which ${missing.length === 1 ? "isn't" : "aren't"} available to ${org.name}.`
}

export type OverrideValue = 'on' | 'off' | 'clear'

export async function setReleaseOverride(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    key: FeatureKey
    value: OverrideValue
    until?: string
    reason: string
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, key } = input
  const label = featureLabel(key)
  const expiresAt = input.value === 'clear' ? null : untilToExpiry(input.until, now)
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const previous = await clearOverride(tx, actor, org.id, 'release', key)
    if (input.value === 'clear' && !previous) {
      throw new CommandError(`${org.name} has no release override for ${label}.`)
    }
    if (input.value !== 'clear') {
      await tx.insert(organizationOverrides).values({
        organizationId: org.id,
        kind: 'release',
        key,
        enabled: input.value === 'on',
        reason: input.reason,
        expiresAt,
        createdByUserId: actor.userId,
      })
    }
    const before = previous ? { enabled: previous.enabled, expiresAt: previous.expiresAt } : null
    const after = input.value === 'clear' ? null : { enabled: input.value === 'on', expiresAt }
    await recordPlatformAudit(tx, {
      actor,
      action: input.value === 'clear' ? 'release.override_cleared' : 'release.override_set',
      targetType: 'feature',
      targetKey: key,
      organizationId: org.id,
      before,
      after,
      reason: input.reason,
    })
    const until = input.until ? ` (until ${formatIsoDate(input.until)})` : ''
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: input.value === 'clear' ? 'release.override_cleared' : 'release.override_set',
      message:
        input.value === 'clear'
          ? `Vento's exception for ${label} ended`
          : `Vento turned ${input.value} ${label} for your organization${until}`,
      before,
      after,
    })
  })
  return input.value === 'clear'
    ? `${org.name}'s release override for ${label} is cleared. Takes effect within 30 seconds.`
    : `${label} is now ${input.value} for ${org.name}. Takes effect within 30 seconds.`
}
