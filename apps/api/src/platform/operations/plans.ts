import {
  ADD_ONS,
  type AddOnKey,
  COUNT_LIMIT_KEYS,
  Decimal,
  type FeatureKey,
  featureLabel,
  isCoreFeature,
  isFeatureKey,
  LIMIT_KEYS,
  type LimitKey,
  type PlanDefinition,
} from '@vento/shared'
import { and, eq, gt, isNull, max, ne, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  organizationAddOns,
  organizationOverrides,
  organizationPlans,
  organizationTrials,
  plans,
  planVersions,
} from '@/db/schema'
import { isLive, organizationAvailability } from '../availability'
import { CommandError } from '../command-error'
import { addDays, endOfLagosDay, lagosToday } from '../dates'
import {
  type PlatformActor,
  recordOrganizationNotice,
  recordPlatformAudit,
} from '../platform-audit'
import { loadOrganizationPlan, loadSnapshot } from '../snapshot'
import { LIMIT_USAGE } from '../usage'
import {
  clearOverride,
  formatIsoDate,
  isCountLimit,
  LIMIT_WORDS,
  lockOrganizationPlan,
  naira,
  type OrganizationRef,
  type PlanVersionRef,
  untilToExpiry,
} from './common'

/** Stored limits: counts as integers, the AI budget as a decimal string. */
function storedLimits(limits: PlanDefinition['limits']): Record<string, number | string> {
  return Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== undefined))
}

/** Publishes version n+1 of a plan (or the plan and v1). Organizations keep their version. */
export async function publishPlan(
  db: DbOrTx,
  actor: PlatformActor,
  input: { definition: PlanDefinition; reason: string },
): Promise<string> {
  const d = input.definition
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: plans.id, name: plans.name, sortOrder: plans.sortOrder })
      .from(plans)
      .where(eq(plans.key, d.key))
      .for('update')
    if (d.defaultForNew) {
      await tx
        .update(plans)
        .set({ isDefaultForNew: false })
        .where(and(eq(plans.isDefaultForNew, true), ne(plans.key, d.key)))
    }
    const defaults = d.defaultForNew === undefined ? {} : { isDefaultForNew: d.defaultForNew }
    let planId: string
    if (existing) {
      planId = existing.id
      await tx
        .update(plans)
        .set({ name: d.name, sortOrder: d.sortOrder, ...defaults })
        .where(eq(plans.id, planId))
    } else {
      const [created] = await tx
        .insert(plans)
        .values({ key: d.key, name: d.name, sortOrder: d.sortOrder, ...defaults })
        .returning({ id: plans.id })
      if (!created) throw new Error('Plan insert returned nothing')
      planId = created.id
    }
    const [latest] = await tx
      .select({ n: max(planVersions.version) })
      .from(planVersions)
      .where(eq(planVersions.planId, planId))
    const version = (latest?.n ?? 0) + 1
    const limits = storedLimits(d.limits)
    await tx.insert(planVersions).values({
      planId,
      version,
      features: [...d.features],
      limits,
      reason: input.reason,
      publishedByUserId: actor.userId,
    })
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.published',
      targetType: 'plan',
      targetKey: d.key,
      before: existing ? { name: existing.name, sortOrder: existing.sortOrder } : null,
      after: { name: d.name, sortOrder: d.sortOrder, version, features: d.features, limits },
      reason: input.reason,
    })
    return version === 1
      ? `${d.name} is published as version 1.`
      : `${d.name} version ${version} is published. Organizations on earlier versions stay there until you assign them.`
  })
}

type LimitChange = { key: LimitKey; used: number; included: number }

/** What moving to a plan version would leave over a limit (nothing is archived). */
async function overLimitsOn(
  db: DbOrTx,
  org: OrganizationRef,
  planVersionId: string,
  now: Date,
): Promise<LimitChange[]> {
  const [snapshot, plan] = await Promise.all([
    loadSnapshot(db, { organizationId: org.id, now }),
    loadOrganizationPlan(db, org.id),
  ])
  const availability = organizationAvailability(
    snapshot,
    { organizationId: org.id, releaseGroup: plan.releaseGroup, planVersionId },
    now,
  )
  const over: LimitChange[] = []
  for (const key of COUNT_LIMIT_KEYS) {
    const included = availability.countLimit(key)
    const counter = LIMIT_USAGE[key]
    if (included === null || !counter) continue
    const used = await counter(db, org.id)
    if (used > included) over.push({ key, used, included })
  }
  return over
}

const NOUN: Record<string, string> = {
  projects: 'projects',
  entities: 'entities',
  members: 'people',
}

export async function previewAssign(
  db: DbOrTx,
  org: OrganizationRef,
  target: PlanVersionRef,
  now = new Date(),
): Promise<string[]> {
  const lines = [`${org.name} moves to ${target.planName} (version ${target.version}).`]
  for (const o of await overLimitsOn(db, org, target.versionId, now)) {
    lines.push(
      `${org.name} has ${o.used} ${LIMIT_WORDS[o.key]}; ${target.planName} includes ${o.included}. Nothing is archived, but they can't add ${NOUN[o.key]}.`,
    )
  }
  const trial = await liveTrial(db, org.id, now)
  if (trial) lines.push(`Their trial ending ${formatIsoDate(trial.endsOn)} will end now.`)
  return lines
}

async function liveTrial(db: DbOrTx, organizationId: string, now: Date, lock = false) {
  const query = db
    .select({
      id: organizationTrials.id,
      endsOn: organizationTrials.endsOn,
      planVersionId: organizationTrials.planVersionId,
    })
    .from(organizationTrials)
    .where(
      and(
        eq(organizationTrials.organizationId, organizationId),
        isNull(organizationTrials.cancelledAt),
        gt(organizationTrials.expiresAt, now),
      ),
    )
    .limit(1)
  const [row] = lock ? await query.for('update') : await query
  return row ?? null
}

/** Cancels the trial and clears the overrides it created. */
async function cancelTrial(
  tx: DbOrTx,
  actor: PlatformActor,
  organizationId: string,
  trialId: string,
): Promise<void> {
  const at = new Date()
  await tx
    .update(organizationTrials)
    .set({ cancelledAt: at, cancelledByUserId: actor.userId })
    .where(eq(organizationTrials.id, trialId))
  await tx
    .update(organizationOverrides)
    .set({ clearedAt: at, clearedByUserId: actor.userId })
    .where(
      and(
        eq(organizationOverrides.organizationId, organizationId),
        eq(organizationOverrides.trialId, trialId),
        isNull(organizationOverrides.clearedAt),
      ),
    )
}

async function planNameOfVersion(db: DbOrTx, versionId: string | null): Promise<string | null> {
  if (!versionId) return null
  const [row] = await db
    .select({ name: plans.name, version: planVersions.version })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(eq(planVersions.id, versionId))
  return row ? `${row.name} v${row.version}` : null
}

export async function assignPlan(
  db: DbOrTx,
  actor: PlatformActor,
  input: { organization: OrganizationRef; target: PlanVersionRef; reason: string },
  now = new Date(),
): Promise<string> {
  const { organization: org, target } = input
  await db.transaction(async (tx) => {
    const current = await lockOrganizationPlan(tx, org.id)
    if (current.planVersionId === target.versionId) {
      throw new CommandError(
        `${org.name} is already on ${target.planName} version ${target.version}.`,
      )
    }
    const trial = await liveTrial(tx, org.id, now, true)
    if (trial) {
      await cancelTrial(tx, actor, org.id, trial.id)
      await recordOrganizationNotice(tx, {
        organizationId: org.id,
        action: 'plan.trial_cancelled',
        message: `Vento ended your ${(await planNameOfVersion(tx, trial.planVersionId))?.replace(/ v\d+$/, '') ?? ''} trial`,
      })
    }
    await tx
      .update(organizationPlans)
      .set({ planVersionId: target.versionId, planAssignedAt: now })
      .where(eq(organizationPlans.organizationId, org.id))
    const before = { plan: await planNameOfVersion(tx, current.planVersionId) }
    const after = { plan: `${target.planName} v${target.version}` }
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.assigned',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      before,
      after,
      reason: input.reason,
      metadata: trial ? { trialCancelled: trial.id } : null,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.assigned',
      message: `Vento moved your organization to ${target.planName}`,
      before,
      after,
    })
  })
  return `${org.name} is now on ${target.planName} (version ${target.version}). Takes effect on its next request.`
}

/**
 * A trial of a bigger plan: one trial row plus entitlement overrides, all expiring together at
 * the end of the last day in Lagos, for every feature and limit the organization doesn't
 * already have. Keys with a live override (a deal) are left alone.
 */
export async function startTrial(
  db: DbOrTx,
  actor: PlatformActor,
  input: { organization: OrganizationRef; target: PlanVersionRef; days: number; reason: string },
  now = new Date(),
): Promise<string> {
  const { organization: org, target } = input
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 90) {
    throw new CommandError('--days must be a whole number from 1 to 90.')
  }
  const endsOn = addDays(lagosToday(now), input.days)
  const expiresAt = endOfLagosDay(endsOn)
  const result = await db.transaction(async (tx) => {
    const plan = await lockOrganizationPlan(tx, org.id)
    const existing = await liveTrial(tx, org.id, now)
    if (existing) {
      throw new CommandError(
        `${org.name} already has a trial ending ${formatIsoDate(existing.endsOn)}. End it first with plans trial "${org.name}" --end.`,
      )
    }
    const snapshot = await loadSnapshot(tx, { organizationId: org.id, now })
    const availability = organizationAvailability(
      snapshot,
      { organizationId: org.id, ...plan },
      now,
    )
    const live = (snapshot.organizations.get(org.id)?.overrides ?? []).filter((o) => isLive(o, now))
    const hasOverride = (kind: 'feature' | 'limit', key: string) =>
      live.some((o) => o.kind === kind && o.key === key)

    const features = target.features
      .filter(isFeatureKey)
      .filter((k) => !availability.entitled(k) && !hasOverride('feature', k))
    const limits: { key: LimitKey; value: string | null }[] = []
    for (const key of LIMIT_KEYS) {
      const current = availability.limit(key)
      const raw = target.limits[key]
      const trialValue = raw === undefined ? null : new Decimal(String(raw)).toFixed(2)
      if (current === null || hasOverride('limit', key)) continue
      if (trialValue === null || new Decimal(trialValue).gt(current)) {
        limits.push({ key, value: trialValue })
      }
    }

    const [trial] = await tx
      .insert(organizationTrials)
      .values({
        organizationId: org.id,
        planVersionId: target.versionId,
        startsAt: now,
        endsOn,
        expiresAt,
        reason: input.reason,
        createdByUserId: actor.userId,
      })
      .returning({ id: organizationTrials.id })
    if (!trial) throw new Error('Trial insert returned nothing')
    const rows = [
      ...features.map((key) => ({
        kind: 'feature' as const,
        key,
        enabled: true,
        limitValue: null,
      })),
      ...limits.map((l) => ({
        kind: 'limit' as const,
        key: l.key,
        enabled: null,
        limitValue: l.value,
      })),
    ]
    if (rows.length) {
      await tx.insert(organizationOverrides).values(
        rows.map((r) => ({
          ...r,
          organizationId: org.id,
          reason: input.reason,
          expiresAt,
          trialId: trial.id,
          createdByUserId: actor.userId,
        })),
      )
    }
    const after = {
      plan: `${target.planName} v${target.version}`,
      endsOn,
      features,
      limits: Object.fromEntries(limits.map((l) => [l.key, l.value ?? 'unlimited'])),
    }
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.trial_started',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      after,
      reason: input.reason,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.trial_started',
      message: `Vento started a ${input.days}-day ${target.planName} trial (ends ${formatIsoDate(endsOn)})`,
      after: { plan: target.planName, endsOn },
    })
    return { features: features.length, limits: limits.length }
  })
  const a = /^[aeiou]/i.test(target.planName) ? 'an' : 'a'
  return `${org.name} has ${a} ${target.planName} trial until ${formatIsoDate(endsOn)}: ${result.features} features and ${result.limits} limits added. Takes effect within 30 seconds.`
}

export async function endTrial(
  db: DbOrTx,
  actor: PlatformActor,
  input: { organization: OrganizationRef; reason: string },
  now = new Date(),
): Promise<string> {
  const { organization: org } = input
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const trial = await liveTrial(tx, org.id, now, true)
    if (!trial) throw new CommandError(`${org.name} has no trial running.`)
    const planName = (await planNameOfVersion(tx, trial.planVersionId))?.replace(/ v\d+$/, '') ?? ''
    await cancelTrial(tx, actor, org.id, trial.id)
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.trial_cancelled',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      before: { trial: trial.id, endsOn: trial.endsOn },
      reason: input.reason,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.trial_cancelled',
      message: `Vento ended your ${planName} trial`,
    })
  })
  return `${org.name}'s trial has ended. Takes effect within 30 seconds.`
}

export async function addAddOn(
  db: DbOrTx,
  actor: PlatformActor,
  input: { organization: OrganizationRef; addOn: AddOnKey; budget: string; reason: string },
  now = new Date(),
): Promise<string> {
  const { organization: org } = input
  const def = ADD_ONS[input.addOn]
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const [existing] = await tx
      .select({ id: organizationAddOns.id, endsAt: organizationAddOns.endsAt })
      .from(organizationAddOns)
      .where(
        and(
          eq(organizationAddOns.organizationId, org.id),
          eq(organizationAddOns.addOnKey, input.addOn),
          isNull(organizationAddOns.cancelledAt),
        ),
      )
      .for('update')
    if (existing && (existing.endsAt === null || existing.endsAt > now)) {
      throw new CommandError(`${org.name} already has ${def.label}. Remove it first to change it.`)
    }
    // An add-on that ran out still holds the "one active" slot: close it off first.
    if (existing) {
      await tx
        .update(organizationAddOns)
        .set({ cancelledAt: now, cancelledByUserId: actor.userId })
        .where(eq(organizationAddOns.id, existing.id))
    }
    const limitIncreases = { [def.limit]: input.budget }
    await tx.insert(organizationAddOns).values({
      organizationId: org.id,
      addOnKey: input.addOn,
      limitIncreases,
      startsAt: now,
      reason: input.reason,
      createdByUserId: actor.userId,
    })
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.add_on_added',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      after: { addOn: input.addOn, limitIncreases },
      reason: input.reason,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.add_on_added',
      message: `Vento added ${def.label} (${naira(input.budget)} a month)`,
      after: { addOn: input.addOn },
    })
  })
  return `${org.name} now has ${def.label} with ${naira(input.budget)} a month. Takes effect within 30 seconds.`
}

export async function removeAddOn(
  db: DbOrTx,
  actor: PlatformActor,
  input: { organization: OrganizationRef; addOn: AddOnKey; reason: string },
  now = new Date(),
): Promise<string> {
  const { organization: org } = input
  const def = ADD_ONS[input.addOn]
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const [removed] = await tx
      .update(organizationAddOns)
      .set({ cancelledAt: now, cancelledByUserId: actor.userId })
      .where(
        and(
          eq(organizationAddOns.organizationId, org.id),
          eq(organizationAddOns.addOnKey, input.addOn),
          isNull(organizationAddOns.cancelledAt),
          or(isNull(organizationAddOns.endsAt), gt(organizationAddOns.endsAt, now)),
        ),
      )
      .returning({ limitIncreases: organizationAddOns.limitIncreases })
    if (!removed) throw new CommandError(`${org.name} doesn't have ${def.label}.`)
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.add_on_removed',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      before: { addOn: input.addOn, limitIncreases: removed.limitIncreases },
      reason: input.reason,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.add_on_removed',
      message: `Vento removed ${def.label}`,
    })
  })
  return `${def.label} is removed from ${org.name}. Takes effect within 30 seconds.`
}

export async function setFeatureOverride(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    key: FeatureKey
    value: 'on' | 'off' | 'clear'
    until?: string
    reason: string
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, key } = input
  const label = featureLabel(key)
  if (isCoreFeature(key)) {
    throw new CommandError(`${label} is in every plan, so there's nothing to override.`)
  }
  const expiresAt = input.value === 'clear' ? null : untilToExpiry(input.until, now)
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const previous = await clearOverride(tx, actor, org.id, 'feature', key)
    if (input.value === 'clear' && !previous) {
      throw new CommandError(`${org.name} has no plan override for ${label}.`)
    }
    if (input.value !== 'clear') {
      await tx.insert(organizationOverrides).values({
        organizationId: org.id,
        kind: 'feature',
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
      action: input.value === 'clear' ? 'plan.override_cleared' : 'plan.feature_overridden',
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
      action: input.value === 'clear' ? 'plan.override_cleared' : 'plan.feature_overridden',
      message:
        input.value === 'clear'
          ? `Vento's exception for ${label} ended`
          : input.value === 'on'
            ? `Vento added ${label} to your organization${until}`
            : `Vento removed ${label} from your organization${until}`,
      before,
      after,
    })
  })
  return input.value === 'clear'
    ? `${org.name}'s plan override for ${label} is cleared. Takes effect within 30 seconds.`
    : `${label} is now ${input.value} in ${org.name}'s plan. Takes effect within 30 seconds.`
}

/** `8`, `unlimited` or `clear`. Counts are whole numbers; the AI budget is NGN. */
export function parseLimitValue(key: LimitKey, raw: string): string | null | 'clear' {
  if (raw === 'clear') return 'clear'
  if (raw === 'unlimited') return null
  const pattern = isCountLimit(key) ? /^\d{1,7}$/ : /^\d{1,12}(\.\d{1,2})?$/
  if (!pattern.test(raw)) {
    throw new CommandError(
      isCountLimit(key)
        ? `Write the ${LIMIT_WORDS[key]} limit as a whole number, unlimited or clear.`
        : 'Write the AI budget in naira, e.g. 150000, or unlimited or clear.',
    )
  }
  return new Decimal(raw).toFixed(2)
}

function shown(key: LimitKey, value: string | null): string {
  if (value === null) return 'unlimited'
  return isCountLimit(key) ? new Decimal(value).toFixed(0) : naira(value)
}

function limitSentence(key: LimitKey, value: string | null): string {
  if (value === null) return `Vento removed your limit on ${LIMIT_WORDS[key]}`
  if (key === 'ai_budget') return `Vento set your AI budget to ${naira(value)} a month`
  return `Vento set your limit to ${new Decimal(value).toFixed(0)} ${LIMIT_WORDS[key]}`
}

export async function setLimitOverride(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    key: LimitKey
    value: string | null | 'clear'
    until?: string
    reason: string
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, key, value } = input
  const expiresAt = value === 'clear' ? null : untilToExpiry(input.until, now)
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const previous = await clearOverride(tx, actor, org.id, 'limit', key)
    if (value === 'clear' && !previous) {
      throw new CommandError(`${org.name} has no override for ${LIMIT_WORDS[key]}.`)
    }
    if (value !== 'clear') {
      await tx.insert(organizationOverrides).values({
        organizationId: org.id,
        kind: 'limit',
        key,
        limitValue: value,
        reason: input.reason,
        expiresAt,
        createdByUserId: actor.userId,
      })
    }
    const before = previous ? { limit: previous.limitValue ?? 'unlimited' } : null
    const after = value === 'clear' ? null : { limit: value ?? 'unlimited', expiresAt }
    await recordPlatformAudit(tx, {
      actor,
      action: value === 'clear' ? 'plan.override_cleared' : 'plan.limit_overridden',
      targetType: 'organization',
      targetKey: key,
      organizationId: org.id,
      before,
      after,
      reason: input.reason,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: value === 'clear' ? 'plan.override_cleared' : 'plan.limit_overridden',
      message:
        value === 'clear'
          ? `Vento's exception for ${LIMIT_WORDS[key]} ended`
          : limitSentence(key, value),
      before,
      after,
    })
  })
  return value === 'clear'
    ? `${org.name}'s ${LIMIT_WORDS[key]} limit is back to the plan's. Takes effect at once.`
    : `${org.name}'s ${LIMIT_WORDS[key]} limit is now ${shown(key, value)}. Takes effect at once.`
}
