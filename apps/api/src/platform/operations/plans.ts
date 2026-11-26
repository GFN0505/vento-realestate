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
  prerequisitesOf,
} from '@vento/shared'
import type { PreviewLine } from '@vento/shared/console'
import { and, count, eq, gt, isNull, max, ne, or } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import {
  organizationAddOns,
  organizationOverrides,
  organizationPlans,
  organizationTrials,
  plans,
  planVersions,
} from '@/db/schema'
import { isUniqueViolation } from '@/lib/errors'
import {
  isLive,
  type OrganizationAvailability,
  type OverrideRow,
  organizationAvailability,
} from '../availability'
import { addDays, endOfLagosDay, lagosToday } from '../dates'
import { LIMIT_WORDS } from '../limit-words'
import {
  type PlatformActor,
  recordOrganizationNotice,
  recordPlatformAudit,
} from '../platform-audit'
import { PlatformError } from '../platform-error'
import { loadSnapshot } from '../snapshot'
import { LIMIT_USAGE } from '../usage'
import {
  assertExpected,
  clearExpiredOverrides,
  clearOverride,
  currentOverrideId,
  formatIsoDate,
  isCountLimit,
  lockOrganizationPlan,
  naira,
  type OrganizationRef,
  organizationState,
  type PlanVersionRef,
  untilToExpiry,
} from './common'
import { impactLines, simulate } from './impact'
import { type Preview, withOverride } from './release'

/** Stored limits: counts as integers, the AI budget as a decimal string. */
function storedLimits(limits: PlanDefinition['limits']): Record<string, number | string> {
  return Object.fromEntries(Object.entries(limits).filter(([, v]) => v !== undefined))
}

async function latestVersionOf(db: DbOrTx, planKey: string) {
  const [row] = await db
    .select({ n: max(planVersions.version) })
    .from(planVersions)
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(eq(plans.key, planKey))
  return row?.n ?? null
}

function limitShown(key: LimitKey, value: unknown): string {
  if (value === undefined || value === null) return 'unlimited'
  return key === 'ai_budget' ? `${naira(String(value))} a month` : String(value)
}

/**
 * What publishing would change against the plan's latest version. Publishing moves nobody:
 * organizations stay on their version until they're moved.
 */
export async function previewPublish(
  db: DbOrTx,
  definition: PlanDefinition,
  isNew?: boolean,
): Promise<Preview<{ latestVersion: number | null }>> {
  const latestVersion = await latestVersionOf(db, definition.key)
  if (isNew === true && latestVersion !== null) {
    throw new PlatformError(`There's already a plan called "${definition.key}".`)
  }
  if (isNew === false && latestVersion === null) {
    throw new PlatformError(`No plan "${definition.key}".`, 'not_found', { missing: 'plan' })
  }
  const lines: PreviewLine[] = [
    {
      text: `${definition.name}: ${definition.features.length} features (plus every core feature).`,
      tone: 'info',
    },
  ]
  if (latestVersion === null) {
    lines.push({ text: `${definition.name} is a new plan, published as version 1.`, tone: 'info' })
  } else {
    const [latest] = await db
      .select({ id: planVersions.id, features: planVersions.features, limits: planVersions.limits })
      .from(planVersions)
      .innerJoin(plans, eq(plans.id, planVersions.planId))
      .where(and(eq(plans.key, definition.key), eq(planVersions.version, latestVersion)))
    const before = new Set(latest?.features ?? [])
    const after = new Set<string>(definition.features)
    const added = definition.features.filter((k) => !before.has(k))
    const removed = [...before].filter((k) => !after.has(k))
    const name = (k: string) => (isFeatureKey(k) ? featureLabel(k) : k)
    if (added.length) {
      lines.push({ text: `Adds ${added.map(name).join(', ')}.`, tone: 'info' })
    }
    if (removed.length) {
      lines.push({ text: `Removes ${removed.map(name).join(', ')}.`, tone: 'warning' })
    }
    const oldLimits = (latest?.limits ?? {}) as Record<string, unknown>
    for (const key of LIMIT_KEYS) {
      const was = oldLimits[key]
      const now = definition.limits[key]
      const same =
        was === undefined || now === undefined
          ? was === now
          : new Decimal(String(was)).eq(new Decimal(String(now)))
      if (!same) {
        lines.push({
          text: `${LIMIT_WORDS[key].many.replace(/^./, (c) => c.toUpperCase())}: ${limitShown(key, was)} → ${limitShown(key, now)}.`,
          tone: 'info',
        })
      }
    }
    const [onPlan] = await db
      .select({ n: count() })
      .from(organizationPlans)
      .innerJoin(planVersions, eq(planVersions.id, organizationPlans.planVersionId))
      .innerJoin(plans, eq(plans.id, planVersions.planId))
      .where(eq(plans.key, definition.key))
    const n = onPlan?.n ?? 0
    lines.push({
      text: `${n} ${n === 1 ? 'organization stays' : 'organizations stay'} on ${definition.name} v${latestVersion} or earlier until you move them.`,
      tone: 'info',
    })
  }
  if (definition.defaultForNew) {
    lines.push({
      text: `${definition.name} becomes the plan for organizations that sign themselves up.`,
      tone: 'warning',
    })
  }
  return { lines, expected: { latestVersion } }
}

/** Publishes version n+1 of a plan (or the plan and v1). Organizations keep their version. */
export async function publishPlan(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    definition: PlanDefinition
    reason: string
    /** Console: a new plan (true) or the next version of an existing one (false). */
    isNew?: boolean
    expected?: { latestVersion: number | null }
  },
): Promise<string> {
  const d = input.definition
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: plans.id, name: plans.name, sortOrder: plans.sortOrder })
      .from(plans)
      .where(eq(plans.key, d.key))
      .for('update')
    if (input.isNew === true && existing) {
      throw new PlatformError(`There's already a plan called "${d.key}".`)
    }
    if (input.isNew === false && !existing) {
      throw new PlatformError(`No plan "${d.key}".`, 'not_found', { missing: 'plan' })
    }
    const [latest] = existing
      ? await tx
          .select({ n: max(planVersions.version) })
          .from(planVersions)
          .where(eq(planVersions.planId, existing.id))
      : [{ n: null }]
    await assertExpected(
      tx,
      input.expected,
      { latestVersion: latest?.n ?? null },
      { targetType: 'plan', targetKey: d.key },
    )
    if (d.defaultForNew) {
      await tx
        .update(plans)
        .set({ isDefaultForNew: false })
        .where(and(eq(plans.isDefaultForNew, true), ne(plans.key, d.key)))
    }
    const defaults = d.defaultForNew === undefined ? {} : { isDefaultForNew: d.defaultForNew }
    let planId: string
    try {
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
    } catch (error) {
      // Someone published a plan with this key or position at the same moment (R5).
      if (isUniqueViolation(error, 'plans_key_unique')) {
        throw new PlatformError(`There's already a plan called "${d.key}".`)
      }
      if (isUniqueViolation(error, 'plans_sort_order_unique')) {
        throw new PlatformError(`Another plan already uses position ${d.sortOrder}.`)
      }
      throw error
    }
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
    const done =
      version === 1
        ? `${d.name} is published as version 1.`
        : `${d.name} version ${version} is published. Organizations on earlier versions stay there until you move them.`
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.published',
      targetType: 'plan',
      targetKey: d.key,
      before: existing ? { name: existing.name, sortOrder: existing.sortOrder } : null,
      after: { name: d.name, sortOrder: d.sortOrder, version, features: d.features, limits },
      reason: input.reason,
      done,
    })
    return done
  })
}

type LimitChange = { key: LimitKey; used: number; included: number }

/** Count limits the organization would be over (nothing is archived). */
async function overLimits(
  db: DbOrTx,
  org: OrganizationRef,
  availability: OrganizationAvailability,
): Promise<LimitChange[]> {
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

export async function previewAssign(
  db: DbOrTx,
  org: OrganizationRef,
  target: PlanVersionRef,
  now = new Date(),
): Promise<Preview<{ planVersionId: string | null }>> {
  const { snapshot, plan } = await organizationState(db, org.id, now)
  if (plan.planVersionId === target.versionId) {
    throw new PlatformError(
      `${org.name} is already on ${target.planName} version ${target.version}.`,
    )
  }
  const lines: PreviewLine[] = [
    { text: `${org.name} moves to ${target.planName} (version ${target.version}).`, tone: 'info' },
  ]
  const trial = await liveTrial(db, org.id, now)
  const sim = simulate(
    snapshot,
    plan,
    {
      planVersionId: target.versionId,
      // Moving plan ends a trial and its overrides.
      rows: (rows) => ({
        ...rows,
        overrides: rows.overrides.filter((o) => !trial || o.trialId !== trial.id),
      }),
    },
    now,
  )
  for (const o of await overLimits(db, org, sim.after)) {
    lines.push({
      text: `${org.name} has ${o.used} ${LIMIT_WORDS[o.key].many}; ${target.planName} includes ${o.included}. Nothing is archived, but they can't add ${LIMIT_WORDS[o.key].things}.`,
      tone: 'warning',
    })
  }
  lines.push(...(await impactLines(db, org, sim)))
  if (trial) {
    lines.push({
      text: `Their trial ending ${formatIsoDate(trial.endsOn)} will end now.`,
      tone: 'warning',
    })
  }
  return { lines, expected: { planVersionId: plan.planVersionId } }
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
  input: {
    organization: OrganizationRef
    target: PlanVersionRef
    reason: string
    expected?: { planVersionId: string | null }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, target } = input
  const done = `${org.name} is now on ${target.planName} (version ${target.version}). Takes effect on its next request.`
  await db.transaction(async (tx) => {
    const current = await lockOrganizationPlan(tx, org.id)
    await assertExpected(
      tx,
      input.expected,
      { planVersionId: current.planVersionId },
      { organizationId: org.id },
    )
    if (current.planVersionId === target.versionId) {
      throw new PlatformError(
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
      done,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.assigned',
      message: `Vento moved your organization to ${target.planName}`,
      before,
      after,
    })
  })
  return done
}

/**
 * What a trial adds: every feature and limit of the target the organization doesn't already
 * have, leaving keys with a live override (a deal) alone.
 */
function trialAdditions(
  availability: OrganizationAvailability,
  live: readonly OverrideRow[],
  target: PlanVersionRef,
) {
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
  return { features, limits }
}

const TRIAL_DAYS = 'A trial lasts 1 to 90 days.'

function existingTrialError(org: OrganizationRef, endsOn: string) {
  return new PlatformError(
    `${org.name} already has a trial ending ${formatIsoDate(endsOn)}.`,
    'refused',
    { next: 'end_trial', organizationName: org.name },
  )
}

export async function previewTrialStart(
  db: DbOrTx,
  org: OrganizationRef,
  target: PlanVersionRef,
  days: number,
  now = new Date(),
): Promise<Preview<{ trialId: null }>> {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new PlatformError(TRIAL_DAYS)
  const existing = await liveTrial(db, org.id, now)
  if (existing) throw existingTrialError(org, existing.endsOn)
  const { snapshot, plan } = await organizationState(db, org.id, now)
  const availability = organizationAvailability(snapshot, plan, now)
  const live = (snapshot.organizations.get(org.id)?.overrides ?? []).filter((o) => isLive(o, now))
  const { features } = trialAdditions(availability, live, target)
  const endsOn = addDays(lagosToday(now), days)
  const sim = simulate(
    snapshot,
    plan,
    {
      rows: (rows) =>
        features.reduce((r, key) => withOverride('feature', key, { enabled: true })(r), rows),
    },
    now,
  )
  const lines: PreviewLine[] = [
    {
      text: `${org.name} gets a ${days}-day ${target.planName} trial, until ${formatIsoDate(endsOn)}.`,
      tone: 'info',
    },
    { text: 'Owners get an email 7 days and 1 day before it ends.', tone: 'info' },
    ...(await impactLines(db, org, sim)),
  ]
  return { lines, expected: { trialId: null } }
}

/**
 * A trial of a bigger plan: one trial row plus entitlement overrides, all expiring together at
 * the end of the last day in Lagos, for every feature and limit the organization doesn't
 * already have. Keys with a live override (a deal) are left alone.
 */
export async function startTrial(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    target: PlanVersionRef
    days: number
    reason: string
    expected?: { trialId: null }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, target } = input
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 90) {
    throw new PlatformError(TRIAL_DAYS)
  }
  const endsOn = addDays(lagosToday(now), input.days)
  const expiresAt = endOfLagosDay(endsOn)
  return db.transaction(async (tx) => {
    const plan = await lockOrganizationPlan(tx, org.id)
    // "Expected no trial" and the operation's own rule are the same check.
    const existing = await liveTrial(tx, org.id, now)
    if (existing) throw existingTrialError(org, existing.endsOn)
    const snapshot = await loadSnapshot(tx, { organizationId: org.id, now })
    const availability = organizationAvailability(
      snapshot,
      { organizationId: org.id, ...plan },
      now,
    )
    const live = (snapshot.organizations.get(org.id)?.overrides ?? []).filter((o) => isLive(o, now))
    const { features, limits } = trialAdditions(availability, live, target)

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
    // A lapsed trial or deal on the same key still holds the live slot until it's cleared.
    await clearExpiredOverrides(tx, actor, now, {
      organizationId: org.id,
      kind: 'feature',
      keys: features,
    })
    await clearExpiredOverrides(tx, actor, now, {
      organizationId: org.id,
      kind: 'limit',
      keys: limits.map((l) => l.key),
    })
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
      try {
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
      } catch (error) {
        // Someone set an override for one of these keys at the same moment.
        if (isUniqueViolation(error, 'organization_overrides_live_unique')) {
          throw new PlatformError(
            `${org.name} got a new override while the trial was being set up. Try again.`,
          )
        }
        throw error
      }
    }
    const a = /^[aeiou]/i.test(target.planName) ? 'an' : 'a'
    const done = `${org.name} has ${a} ${target.planName} trial until ${formatIsoDate(endsOn)}: ${features.length} features and ${limits.length} limits added. Takes effect within 30 seconds.`
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
      done,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.trial_started',
      message: `Vento started a ${input.days}-day ${target.planName} trial (ends ${formatIsoDate(endsOn)})`,
      after: { plan: target.planName, endsOn },
    })
    return done
  })
}

function noTrialError(org: OrganizationRef) {
  return new PlatformError(`${org.name} has no trial running.`)
}

export async function previewTrialEnd(
  db: DbOrTx,
  org: OrganizationRef,
  now = new Date(),
): Promise<Preview<{ trialId: string }>> {
  const trial = await liveTrial(db, org.id, now)
  if (!trial) throw noTrialError(org)
  const { snapshot, plan } = await organizationState(db, org.id, now)
  const planName = (await planNameOfVersion(db, trial.planVersionId))?.replace(/ v\d+$/, '') ?? ''
  const sim = simulate(
    snapshot,
    plan,
    {
      rows: (rows) => ({
        ...rows,
        overrides: rows.overrides.filter((o) => o.trialId !== trial.id),
      }),
    },
    now,
  )
  return {
    lines: [
      { text: `${org.name}'s ${planName} trial will end now.`, tone: 'info' },
      ...(await impactLines(db, org, sim)),
    ],
    expected: { trialId: trial.id },
  }
}

export async function endTrial(
  db: DbOrTx,
  actor: PlatformActor,
  input: { organization: OrganizationRef; reason: string; expected?: { trialId: string } },
  now = new Date(),
): Promise<string> {
  const { organization: org } = input
  const done = `${org.name}'s trial has ended. Takes effect within 30 seconds.`
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const trial = await liveTrial(tx, org.id, now, true)
    if (!trial) throw noTrialError(org)
    await assertExpected(tx, input.expected, { trialId: trial.id }, { organizationId: org.id })
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
      done,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.trial_cancelled',
      message: `Vento ended your ${planName} trial`,
    })
  })
  return done
}

/** The add-on row holding the "one active" slot (not cancelled), and whether it's running now. */
async function addOnRow(
  db: DbOrTx,
  organizationId: string,
  addOn: AddOnKey,
  now: Date,
  lock = false,
) {
  const query = db
    .select({
      id: organizationAddOns.id,
      endsAt: organizationAddOns.endsAt,
      limitIncreases: organizationAddOns.limitIncreases,
    })
    .from(organizationAddOns)
    .where(
      and(
        eq(organizationAddOns.organizationId, organizationId),
        eq(organizationAddOns.addOnKey, addOn),
        isNull(organizationAddOns.cancelledAt),
      ),
    )
  const [row] = lock ? await query.for('update') : await query
  if (!row) return null
  const limit = ADD_ONS[addOn].limit
  const raw = (row.limitIncreases as Record<string, unknown> | null)?.[limit]
  return {
    id: row.id,
    running: row.endsAt === null || row.endsAt > now,
    budget: raw === undefined ? '0.00' : new Decimal(String(raw)).toFixed(2),
  }
}

function alreadyHasError(org: OrganizationRef, addOn: AddOnKey) {
  return new PlatformError(`${org.name} already has ${ADD_ONS[addOn].label}.`, 'refused', {
    next: 'change_ai_budget',
    organizationName: org.name,
  })
}

function doesNotHaveError(org: OrganizationRef, addOn: AddOnKey) {
  return new PlatformError(`${org.name} doesn't have ${ADD_ONS[addOn].label}.`)
}

export async function previewAddOn(
  db: DbOrTx,
  org: OrganizationRef,
  addOn: AddOnKey,
  budget: string,
  now = new Date(),
): Promise<Preview<{ addOnId: null }>> {
  const existing = await addOnRow(db, org.id, addOn, now)
  if (existing?.running) throw alreadyHasError(org, addOn)
  const { snapshot, plan } = await organizationState(db, org.id, now)
  const sim = simulate(
    snapshot,
    plan,
    {
      rows: (rows) => ({
        ...rows,
        addOns: [
          ...rows.addOns.filter((a) => a.addOnKey !== addOn),
          {
            addOnKey: addOn,
            limitIncreases: { [ADD_ONS[addOn].limit]: budget },
            startsAt: now,
            endsAt: null,
          },
        ],
      }),
    },
    now,
  )
  return {
    lines: [
      {
        text: `${org.name} gets ${ADD_ONS[addOn].label} with ${naira(budget)} a month.`,
        tone: 'info',
      },
      { text: 'Owners can then switch AI features on in Settings → AI.', tone: 'info' },
      ...(await impactLines(db, org, sim)),
    ],
    expected: { addOnId: null },
  }
}

export async function addAddOn(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    addOn: AddOnKey
    budget: string
    reason: string
    expected?: { addOnId: null }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org } = input
  const def = ADD_ONS[input.addOn]
  const done = `${org.name} now has ${def.label} with ${naira(input.budget)} a month. Takes effect within 30 seconds.`
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const existing = await addOnRow(tx, org.id, input.addOn, now, true)
    // "Expected none" and the operation's own rule are the same check.
    if (existing?.running) throw alreadyHasError(org, input.addOn)
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
      done,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.add_on_added',
      message: `Vento added ${def.label} (${naira(input.budget)} a month)`,
      after: { addOn: input.addOn },
    })
  })
  return done
}

export async function previewAddOnBudget(
  db: DbOrTx,
  org: OrganizationRef,
  addOn: AddOnKey,
  budget: string,
  now = new Date(),
): Promise<Preview<{ addOnId: string; budget: string }>> {
  const existing = await addOnRow(db, org.id, addOn, now)
  if (!existing?.running) throw doesNotHaveError(org, addOn)
  if (new Decimal(existing.budget).eq(budget)) {
    throw new PlatformError(`${ADD_ONS[addOn].label} is already ${naira(budget)} a month.`)
  }
  return {
    lines: [
      {
        text: `${org.name}'s ${ADD_ONS[addOn].label} budget changes from ${naira(existing.budget)} to ${naira(budget)} a month.`,
        tone: 'info',
      },
    ],
    expected: { addOnId: existing.id, budget: existing.budget },
  }
}

/**
 * A new monthly budget, console only: the current add-on row closes and a new one starts now, so
 * each row's terms never change (billing reads clean periods). One platform event, one notice.
 */
export async function changeAddOnBudget(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    addOn: AddOnKey
    budget: string
    reason: string
    expected?: { addOnId: string; budget: string }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org } = input
  const def = ADD_ONS[input.addOn]
  const done = `${org.name}'s ${def.label} budget is now ${naira(input.budget)} a month. Takes effect at once.`
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const existing = await addOnRow(tx, org.id, input.addOn, now, true)
    if (!existing?.running) throw doesNotHaveError(org, input.addOn)
    await assertExpected(
      tx,
      input.expected,
      { addOnId: existing.id, budget: existing.budget },
      { organizationId: org.id },
    )
    if (new Decimal(existing.budget).eq(input.budget)) {
      throw new PlatformError(`${def.label} is already ${naira(input.budget)} a month.`)
    }
    await tx
      .update(organizationAddOns)
      .set({ cancelledAt: now, cancelledByUserId: actor.userId })
      .where(eq(organizationAddOns.id, existing.id))
    const limitIncreases = { [def.limit]: input.budget }
    await tx.insert(organizationAddOns).values({
      organizationId: org.id,
      addOnKey: input.addOn,
      limitIncreases,
      startsAt: now,
      reason: input.reason,
      createdByUserId: actor.userId,
    })
    const before = { addOn: input.addOn, limitIncreases: { [def.limit]: existing.budget } }
    const after = { addOn: input.addOn, limitIncreases }
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.add_on_changed',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      before,
      after,
      reason: input.reason,
      done,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.add_on_changed',
      message: `Vento changed your ${def.label} budget to ${naira(input.budget)} a month`,
      before: { budget: existing.budget },
      after: { budget: input.budget },
    })
  })
  return done
}

export async function previewRemoveAddOn(
  db: DbOrTx,
  org: OrganizationRef,
  addOn: AddOnKey,
  now = new Date(),
): Promise<Preview<{ addOnId: string }>> {
  const existing = await addOnRow(db, org.id, addOn, now)
  if (!existing?.running) throw doesNotHaveError(org, addOn)
  const { snapshot, plan } = await organizationState(db, org.id, now)
  const sim = simulate(
    snapshot,
    plan,
    { rows: (rows) => ({ ...rows, addOns: rows.addOns.filter((a) => a.addOnKey !== addOn) }) },
    now,
  )
  return {
    lines: [
      { text: `${ADD_ONS[addOn].label} will be removed from ${org.name}.`, tone: 'info' },
      ...(await impactLines(db, org, sim)),
    ],
    expected: { addOnId: existing.id },
  }
}

export async function removeAddOn(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    addOn: AddOnKey
    reason: string
    expected?: { addOnId: string }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org } = input
  const def = ADD_ONS[input.addOn]
  const done = `${def.label} is removed from ${org.name}. Takes effect within 30 seconds.`
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
      .returning({ id: organizationAddOns.id, limitIncreases: organizationAddOns.limitIncreases })
    if (!removed) throw doesNotHaveError(org, input.addOn)
    await assertExpected(tx, input.expected, { addOnId: removed.id }, { organizationId: org.id })
    await recordPlatformAudit(tx, {
      actor,
      action: 'plan.add_on_removed',
      targetType: 'organization',
      targetKey: org.id,
      organizationId: org.id,
      before: { addOn: input.addOn, limitIncreases: removed.limitIncreases },
      reason: input.reason,
      done,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: 'plan.add_on_removed',
      message: `Vento removed ${def.label}`,
    })
  })
  return done
}

function coreRefusal(key: FeatureKey) {
  return new PlatformError(`${featureLabel(key)} is in every plan, so there's nothing to override.`)
}

export async function previewFeatureOverride(
  db: DbOrTx,
  org: OrganizationRef,
  key: FeatureKey,
  value: 'on' | 'off' | 'clear',
  until?: string,
  now = new Date(),
): Promise<Preview<{ overrideId: string | null }>> {
  const label = featureLabel(key)
  if (isCoreFeature(key)) throw coreRefusal(key)
  if (value !== 'clear') untilToExpiry(until, now)
  const overrideId = await currentOverrideId(db, org.id, 'feature', key)
  if (value === 'clear' && !overrideId) {
    throw new PlatformError(`${org.name} has no plan override for ${label}.`)
  }
  const { snapshot, plan } = await organizationState(db, org.id, now)
  const sim = simulate(
    snapshot,
    plan,
    {
      rows: withOverride('feature', key, value === 'clear' ? 'clear' : { enabled: value === 'on' }),
    },
    now,
  )
  const lines: PreviewLine[] = [
    {
      text:
        value === 'clear'
          ? `${org.name}'s plan override for ${label} will be cleared, so ${label} follows ${sim.after.plan ? `${sim.after.plan.planName} again` : 'the plan again'}.`
          : `${label} will be ${value} in ${org.name}'s plan${until ? ` until ${until}` : ''}.`,
      tone: 'info',
    },
  ]
  if (value === 'on') {
    const missing = prerequisitesOf(key).filter((p) => !sim.after.has(p))
    if (missing.length) {
      lines.push({
        text: `${label} needs ${missing.map(featureLabel).join(' and ')}, which ${missing.length === 1 ? "isn't" : "aren't"} available to ${org.name}.`,
        tone: 'warning',
      })
    }
  }
  lines.push(...(await impactLines(db, org, sim)))
  return { lines, expected: { overrideId } }
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
    expected?: { overrideId: string | null }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, key } = input
  const label = featureLabel(key)
  if (isCoreFeature(key)) throw coreRefusal(key)
  const expiresAt = input.value === 'clear' ? null : untilToExpiry(input.until, now)
  const done =
    input.value === 'clear'
      ? `${org.name}'s plan override for ${label} is cleared. Takes effect within 30 seconds.`
      : `${label} is now ${input.value} in ${org.name}'s plan. Takes effect within 30 seconds.`
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const previous = await clearOverride(tx, actor, org.id, 'feature', key)
    await assertExpected(
      tx,
      input.expected,
      { overrideId: previous?.id ?? null },
      { organizationId: org.id },
    )
    if (input.value === 'clear' && !previous) {
      throw new PlatformError(`${org.name} has no plan override for ${label}.`)
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
      done,
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
  return done
}

/** `8`, `unlimited` or `clear`. Counts are whole numbers; the AI budget is NGN. */
export function parseLimitValue(key: LimitKey, raw: string): string | null | 'clear' {
  if (raw === 'clear') return 'clear'
  if (raw === 'unlimited') return null
  const pattern = isCountLimit(key) ? /^\d{1,7}$/ : /^\d{1,12}(\.\d{1,2})?$/
  if (!pattern.test(raw)) {
    throw new PlatformError(
      isCountLimit(key)
        ? `Write the ${LIMIT_WORDS[key].many} limit as a whole number, unlimited or clear.`
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
  if (value === null) return `Vento removed your limit on ${LIMIT_WORDS[key].many}`
  if (key === 'ai_budget') return `Vento set your AI budget to ${naira(value)} a month`
  return `Vento set your limit to ${new Decimal(value).toFixed(0)} ${LIMIT_WORDS[key].many}`
}

export async function previewLimitOverride(
  db: DbOrTx,
  org: OrganizationRef,
  key: LimitKey,
  value: string | null | 'clear',
  until?: string,
  now = new Date(),
): Promise<Preview<{ overrideId: string | null }>> {
  const words = LIMIT_WORDS[key].many
  if (value !== 'clear') untilToExpiry(until, now)
  const overrideId = await currentOverrideId(db, org.id, 'limit', key)
  if (value === 'clear' && !overrideId) {
    throw new PlatformError(`${org.name} has no override for ${words}.`)
  }
  const { snapshot, plan } = await organizationState(db, org.id, now)
  const sim = simulate(
    snapshot,
    plan,
    { rows: withOverride('limit', key, value === 'clear' ? 'clear' : { limitValue: value }) },
    now,
  )
  const after = sim.after.limit(key)
  const lines: PreviewLine[] = [
    {
      text:
        value === 'clear'
          ? `${org.name}'s ${words} limit goes back to ${sim.after.plan ? `${sim.after.plan.planName}'s` : "the plan's"} ${shown(key, after)}.`
          : `${org.name}'s ${words} limit will be ${shown(key, value)}${until ? ` until ${until}` : ''}.`,
      tone: 'info',
    },
  ]
  if (isCountLimit(key) && after !== null) {
    const counter = LIMIT_USAGE[key]
    const used = counter ? await counter(db, org.id) : 0
    const included = new Decimal(after).floor().toNumber()
    if (counter && used > included) {
      lines.push({
        text: `${org.name} has ${used} ${words}, over the new limit. Nothing is archived, but they can't add ${LIMIT_WORDS[key].things}.`,
        tone: 'warning',
      })
    }
  }
  return { lines, expected: { overrideId } }
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
    expected?: { overrideId: string | null }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, key, value } = input
  const expiresAt = value === 'clear' ? null : untilToExpiry(input.until, now)
  const done =
    value === 'clear'
      ? `${org.name}'s ${LIMIT_WORDS[key].many} limit is back to the plan's. Takes effect at once.`
      : `${org.name}'s ${LIMIT_WORDS[key].many} limit is now ${shown(key, value)}. Takes effect at once.`
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const previous = await clearOverride(tx, actor, org.id, 'limit', key)
    await assertExpected(
      tx,
      input.expected,
      { overrideId: previous?.id ?? null },
      { organizationId: org.id },
    )
    if (value === 'clear' && !previous) {
      throw new PlatformError(`${org.name} has no override for ${LIMIT_WORDS[key].many}.`)
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
      done,
    })
    await recordOrganizationNotice(tx, {
      organizationId: org.id,
      action: value === 'clear' ? 'plan.override_cleared' : 'plan.limit_overridden',
      message:
        value === 'clear'
          ? `Vento's exception for ${LIMIT_WORDS[key].many} ended`
          : limitSentence(key, value),
      before,
      after,
    })
  })
  return done
}
