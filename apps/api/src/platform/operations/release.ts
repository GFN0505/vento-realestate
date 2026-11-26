import {
  addOnOf,
  type FeatureKey,
  featureLabel,
  isCoreFeature,
  isFeatureKey,
  prerequisitesOf,
  type ReleaseGroup,
  type ReleaseStage,
} from '@vento/shared'
import type { PreviewLine } from '@vento/shared/console'
import { eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import {
  featureReleases,
  organizationOverrides,
  organizationPlans,
  organizations,
  planVersions,
} from '@/db/schema'
import {
  type OrganizationRows,
  organizationAvailability,
  type Snapshot,
  stageOf,
} from '../availability'
import {
  type PlatformActor,
  recordOrganizationNotice,
  recordPlatformAudit,
} from '../platform-audit'
import { PlatformError } from '../platform-error'
import { loadSnapshot } from '../snapshot'
import { FEATURE_RECORD_COUNTERS } from '../usage'
import {
  assertExpected,
  clearOverride,
  currentOverrideId,
  formatIsoDate,
  labels,
  lockOrganizationPlan,
  type OrganizationRef,
  organizationState,
  untilToExpiry,
} from './common'
import { impactLines, simulate } from './impact'

type OrgPlanRow = OrganizationRef & {
  releaseGroup: ReleaseGroup
  planVersionId: string | null
}

export type Preview<E> = { lines: PreviewLine[]; expected: E }

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

/** Keys in stored stages and plan versions that the code no longer has (ignored on load). */
export async function unknownKeysInData(db: DbOrTx): Promise<string[]> {
  const [stages, versions] = await runQueries(db, [
    () => db.select({ key: featureReleases.featureKey }).from(featureReleases),
    () => db.select({ features: planVersions.features }).from(planVersions),
  ])
  const keys = new Set([...stages.map((s) => s.key), ...versions.flatMap((v) => v.features)])
  return [...keys].filter((k) => !isFeatureKey(k)).sort()
}

/** In a plan (latest versions), core, or sold with an add-on. */
export function inAnyPlan(snapshot: Snapshot, key: FeatureKey): boolean {
  return (
    isCoreFeature(key) ||
    addOnOf(key) !== undefined ||
    snapshot.latestPlans.some((p) => p.features.has(key))
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

/** What a stage change would do: who has it after, warnings, records that drop out of view. */
export async function previewStage(
  db: DbOrTx,
  key: FeatureKey,
  stage: ReleaseStage,
  now = new Date(),
): Promise<Preview<{ stage: ReleaseStage }>> {
  const [snapshot, orgs] = await runQueries(db, [
    () => loadSnapshot(db, { now }),
    () => allOrganizationPlans(db),
  ])
  const label = featureLabel(key)
  const current = stageOf(snapshot, key)
  if (current === stage) throw new PlatformError(`${label} is already at ${stage}.`)
  const before = holders(snapshot, orgs, key, now)
  const stages = new Map(snapshot.stages)
  stages.set(key, stage)
  const after = holders({ ...snapshot, stages }, orgs, key, now)
  const lines: PreviewLine[] =
    stage === 'off'
      ? [
          {
            text: `${label} will be switched off for everyone (${organizationsWord(before.length)} have it now).`,
            tone: 'danger',
          },
        ]
      : [
          {
            text: `${label} will be available to ${organizationsWord(after.length)}${byGroup(after)}.`,
            tone: 'info',
          },
        ]
  if (stage === 'on' && !inAnyPlan(snapshot, key)) {
    lines.push({
      text: `${label} is in no plan, so standard organizations still won't have it.`,
      tone: 'warning',
    })
  }
  const losing = before.filter((o) => !after.some((a) => a.id === o.id))
  const counter = FEATURE_RECORD_COUNTERS[key]
  for (const org of losing) {
    const n = counter ? await counter(db, org.id) : 0
    if (n > 0) {
      lines.push({
        text: `${org.name} has ${n} records in ${label}. Its members will stop seeing them.`,
        tone: 'danger',
      })
    }
  }
  return { lines, expected: { stage: current } }
}

export async function setStage(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    key: FeatureKey
    stage: ReleaseStage
    reason: string
    expected?: { stage: ReleaseStage }
  },
): Promise<string> {
  const label = featureLabel(input.key)
  const done =
    input.stage === 'off'
      ? `${label} is now off for everyone, including overrides and plans.`
      : `${label} is now at ${input.stage}. Takes effect within 30 seconds.`
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ stage: featureReleases.stage })
      .from(featureReleases)
      .where(eq(featureReleases.featureKey, input.key))
      .for('update')
    const current = existing?.stage ?? 'internal'
    await assertExpected(
      tx,
      input.expected,
      { stage: current },
      {
        targetType: 'feature',
        targetKey: input.key,
      },
    )
    if (current === input.stage) throw new PlatformError(`${label} is already at ${input.stage}.`)
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
      before: { stage: current },
      after: { stage: input.stage },
      reason: input.reason,
      done,
    })
  })
  return done
}

/** Moving an organization to another release group: what it gains and loses. */
export async function previewGroup(
  db: DbOrTx,
  org: OrganizationRef,
  group: ReleaseGroup,
  now = new Date(),
): Promise<Preview<{ releaseGroup: ReleaseGroup }>> {
  const { snapshot, plan } = await organizationState(db, org.id, now)
  if (plan.releaseGroup === group) {
    throw new PlatformError(`${org.name} is already in the ${group} group.`)
  }
  const lines: PreviewLine[] = [
    { text: `${org.name} moves from ${plan.releaseGroup} to ${group}.`, tone: 'info' },
  ]
  if (group === 'internal') {
    lines.push({
      text: 'Internal organizations get every feature, early ones included, with no limits.',
      tone: 'warning',
    })
  }
  const sim = simulate(snapshot, plan, { releaseGroup: group }, now)
  lines.push(...(await impactLines(db, org, sim)))
  return { lines, expected: { releaseGroup: plan.releaseGroup } }
}

export async function setReleaseGroup(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    group: ReleaseGroup
    reason: string
    expected?: { releaseGroup: ReleaseGroup }
  },
): Promise<string> {
  const { organization: org } = input
  const done = `${org.name} is now in the ${input.group} group. Takes effect on its next request.`
  await db.transaction(async (tx) => {
    const current = await lockOrganizationPlan(tx, org.id)
    await assertExpected(
      tx,
      input.expected,
      { releaseGroup: current.releaseGroup },
      { organizationId: org.id },
    )
    if (current.releaseGroup === input.group) {
      throw new PlatformError(`${org.name} is already in the ${input.group} group.`)
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
      done,
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
  return done
}

/** Prerequisites the organization doesn't have, for "Buyer portal needs Sales and Finance, …". */
export async function missingPrerequisites(
  db: DbOrTx,
  org: OrganizationRef,
  key: FeatureKey,
  now = new Date(),
): Promise<string | null> {
  const { snapshot, plan } = await organizationState(db, org.id, now)
  const availability = organizationAvailability(snapshot, plan, now)
  return missingPrerequisitesIn(availability, org, key)
}

function missingPrerequisitesIn(
  availability: { has(key: FeatureKey): boolean },
  org: OrganizationRef,
  key: FeatureKey,
): string | null {
  const missing = prerequisitesOf(key).filter((p) => !availability.has(p))
  if (missing.length === 0) return null
  return `${featureLabel(key)} needs ${labels(missing)}, which ${missing.length === 1 ? "isn't" : "aren't"} available to ${org.name}.`
}

export type OverrideValue = 'on' | 'off' | 'clear'

/** Replaces (or removes) the organization's live override of a kind and key, in memory. */
export function withOverride(
  kind: 'release' | 'feature' | 'limit',
  key: string,
  value: { enabled?: boolean; limitValue?: string | null } | 'clear',
) {
  return (rows: OrganizationRows): OrganizationRows => ({
    ...rows,
    overrides: [
      ...rows.overrides.filter((o) => !(o.kind === kind && o.key === key)),
      ...(value === 'clear'
        ? []
        : [
            {
              kind,
              key,
              enabled: value.enabled ?? null,
              limitValue: value.limitValue ?? null,
              expiresAt: null,
              trialId: null,
            },
          ]),
    ],
  })
}

/** A release override for one organization: the change, missing prerequisites, the kill switch. */
export async function previewReleaseOverride(
  db: DbOrTx,
  org: OrganizationRef,
  key: FeatureKey,
  value: OverrideValue,
  until?: string,
  now = new Date(),
): Promise<Preview<{ overrideId: string | null }>> {
  const label = featureLabel(key)
  if (value !== 'clear') untilToExpiry(until, now)
  const [{ snapshot, plan }, overrideId] = await runQueries(db, [
    () => organizationState(db, org.id, now),
    () => currentOverrideId(db, org.id, 'release', key),
  ])
  if (value === 'clear' && !overrideId) {
    throw new PlatformError(`${org.name} has no release override for ${label}.`)
  }
  const lines: PreviewLine[] = [
    {
      text:
        value === 'clear'
          ? `${org.name}'s release override for ${label} will be cleared.`
          : `${label} will be released ${value} for ${org.name}${until ? ` until ${until}` : ''}.`,
      tone: 'info',
    },
  ]
  const sim = simulate(
    snapshot,
    plan,
    {
      rows: withOverride('release', key, value === 'clear' ? 'clear' : { enabled: value === 'on' }),
    },
    now,
  )
  if (value === 'on') {
    const missing = missingPrerequisitesIn(sim.before, org, key)
    if (missing) lines.push({ text: missing, tone: 'warning' })
  }
  if (stageOf(snapshot, key) === 'off') {
    lines.push({
      text: `${label} is switched off for everyone, so this has no effect until it's back on.`,
      tone: 'warning',
    })
  }
  lines.push(...(await impactLines(db, org, sim)))
  return { lines, expected: { overrideId } }
}

export async function setReleaseOverride(
  db: DbOrTx,
  actor: PlatformActor,
  input: {
    organization: OrganizationRef
    key: FeatureKey
    value: OverrideValue
    until?: string
    reason: string
    expected?: { overrideId: string | null }
  },
  now = new Date(),
): Promise<string> {
  const { organization: org, key } = input
  const label = featureLabel(key)
  const expiresAt = input.value === 'clear' ? null : untilToExpiry(input.until, now)
  const done =
    input.value === 'clear'
      ? `${org.name}'s release override for ${label} is cleared. Takes effect within 30 seconds.`
      : `${label} is now ${input.value} for ${org.name}. Takes effect within 30 seconds.`
  await db.transaction(async (tx) => {
    await lockOrganizationPlan(tx, org.id)
    const previous = await clearOverride(tx, actor, org.id, 'release', key)
    await assertExpected(
      tx,
      input.expected,
      { overrideId: previous?.id ?? null },
      { organizationId: org.id },
    )
    if (input.value === 'clear' && !previous) {
      throw new PlatformError(`${org.name} has no release override for ${label}.`)
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
      done,
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
  return done
}
