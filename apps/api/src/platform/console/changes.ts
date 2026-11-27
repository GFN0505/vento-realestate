import { Decimal, type PlanDefinition } from '@vento/shared'
import type {
  addAi,
  changeAiBudget,
  changePlan,
  changeReleaseGroup,
  clearOverride,
  endTrial,
  publishPlan,
  removeAi,
  setOverride,
  setStage,
  startTrial,
} from '@vento/shared/console'
import type { z } from 'zod'
import type { DbOrTx } from '@/db/client'
import { findPlanVersion, organizationById } from '../operations/common'
import * as plans from '../operations/plans'
import * as release from '../operations/release'
import type { PlatformActor } from '../platform-audit'
import { PlatformError } from '../platform-error'

// Each console change calls the same preview and operation the command does (admin-console plan
// §6). Previews return the lines and the before-state; applies pass that state back as `expected`.

type In<T extends { previewInput: z.ZodType }> = z.output<T['previewInput']>
type Apply<T extends { applyInput: z.ZodType }> = z.output<T['applyInput']>

export const changePlanChange = {
  async preview(db: DbOrTx, input: In<typeof changePlan>) {
    const org = await organizationById(db, input.organizationId)
    return plans.previewAssign(db, org, await findPlanVersion(db, input.planKey, input.version))
  },
  async apply(db: DbOrTx, actor: PlatformActor, input: Apply<typeof changePlan>) {
    const organization = await organizationById(db, input.organizationId)
    const target = await findPlanVersion(db, input.planKey, input.version)
    return plans.assignPlan(db, actor, { organization, target, ...common(input) })
  },
}

export const startTrialChange = {
  async preview(db: DbOrTx, input: In<typeof startTrial>) {
    const org = await organizationById(db, input.organizationId)
    const target = await findPlanVersion(db, input.planKey)
    return plans.previewTrialStart(db, org, target, input.days)
  },
  async apply(db: DbOrTx, actor: PlatformActor, input: Apply<typeof startTrial>) {
    const organization = await organizationById(db, input.organizationId)
    const target = await findPlanVersion(db, input.planKey)
    return plans.startTrial(db, actor, {
      organization,
      target,
      days: input.days,
      ...common(input),
    })
  },
}

export const endTrialChange = {
  async preview(db: DbOrTx, input: In<typeof endTrial>) {
    return plans.previewTrialEnd(db, await organizationById(db, input.organizationId))
  },
  async apply(db: DbOrTx, actor: PlatformActor, input: Apply<typeof endTrial>) {
    const organization = await organizationById(db, input.organizationId)
    return plans.endTrial(db, actor, { organization, ...common(input) })
  },
}

export const addAiChange = {
  async preview(db: DbOrTx, input: In<typeof addAi>) {
    const org = await organizationById(db, input.organizationId)
    return plans.previewAddOn(db, org, 'ai', input.budget)
  },
  async apply(db: DbOrTx, actor: PlatformActor, input: Apply<typeof addAi>) {
    const organization = await organizationById(db, input.organizationId)
    return plans.addAddOn(db, actor, {
      organization,
      addOn: 'ai',
      budget: input.budget,
      ...common(input),
    })
  },
}

export const changeAiBudgetChange = {
  async preview(db: DbOrTx, input: In<typeof changeAiBudget>) {
    const org = await organizationById(db, input.organizationId)
    return plans.previewAddOnBudget(db, org, 'ai', input.budget)
  },
  async apply(db: DbOrTx, actor: PlatformActor, input: Apply<typeof changeAiBudget>) {
    const organization = await organizationById(db, input.organizationId)
    return plans.changeAddOnBudget(db, actor, {
      organization,
      addOn: 'ai',
      budget: input.budget,
      ...common(input),
    })
  },
}

export const removeAiChange = {
  async preview(db: DbOrTx, input: In<typeof removeAi>) {
    return plans.previewRemoveAddOn(db, await organizationById(db, input.organizationId), 'ai')
  },
  async apply(db: DbOrTx, actor: PlatformActor, input: Apply<typeof removeAi>) {
    const organization = await organizationById(db, input.organizationId)
    return plans.removeAddOn(db, actor, { organization, addOn: 'ai', ...common(input) })
  },
}

export const releaseGroupChange = {
  async preview(db: DbOrTx, input: In<typeof changeReleaseGroup>) {
    const org = await organizationById(db, input.organizationId)
    return release.previewGroup(db, org, input.group)
  },
  async apply(db: DbOrTx, actor: PlatformActor, input: Apply<typeof changeReleaseGroup>) {
    const organization = await organizationById(db, input.organizationId)
    return release.setReleaseGroup(db, actor, {
      organization,
      group: input.group,
      ...common(input),
    })
  },
}

/** A limit as the operations store it: a decimal string, or null for unlimited. */
function limitStored(value: number | string): string | null {
  if (value === 'unlimited') return null
  return new Decimal(String(value)).toFixed(2)
}

type SetIn = In<typeof setOverride>
type ClearIn = In<typeof clearOverride>

/** On, off or a limit; or `clear`. Routed to the release, plan-feature or limit override. */
async function overridePreview(db: DbOrTx, input: SetIn | ClearIn, clear: boolean) {
  const org = await organizationById(db, input.organizationId)
  const until = 'until' in input ? input.until : undefined
  if (input.kind === 'limit') {
    const value = clear ? 'clear' : limitStored((input as Extract<SetIn, { kind: 'limit' }>).value)
    return plans.previewLimitOverride(db, org, input.key, value, until)
  }
  const value = clear ? 'clear' : (input as Extract<SetIn, { kind: 'release' | 'feature' }>).value
  return input.kind === 'release'
    ? release.previewReleaseOverride(db, org, input.key, value, until)
    : plans.previewFeatureOverride(db, org, input.key, value, until)
}

async function overrideApply(
  db: DbOrTx,
  actor: PlatformActor,
  input: Apply<typeof setOverride> | Apply<typeof clearOverride>,
  clear: boolean,
) {
  const organization = await organizationById(db, input.organizationId)
  const until = 'until' in input ? input.until : undefined
  const base = { organization, until, ...common(input) }
  if (input.kind === 'limit') {
    const value = clear ? 'clear' : limitStored((input as { value: number | string }).value)
    return plans.setLimitOverride(db, actor, { ...base, key: input.key, value })
  }
  const value = clear ? 'clear' : (input as { value: 'on' | 'off' }).value
  return input.kind === 'release'
    ? release.setReleaseOverride(db, actor, { ...base, key: input.key, value })
    : plans.setFeatureOverride(db, actor, { ...base, key: input.key, value })
}

export const setOverrideChange = {
  preview: (db: DbOrTx, input: SetIn) => overridePreview(db, input, false),
  apply: (db: DbOrTx, actor: PlatformActor, input: Apply<typeof setOverride>) =>
    overrideApply(db, actor, input, false),
}

export const clearOverrideChange = {
  async preview(db: DbOrTx, input: ClearIn) {
    const { lines, expected } = await overridePreview(db, input, true)
    // The previews refuse a clear with nothing to clear, so there's always an id here.
    if (!expected.overrideId) throw new PlatformError('There is no override to clear.')
    return { lines, expected: { overrideId: expected.overrideId } }
  },
  apply: (db: DbOrTx, actor: PlatformActor, input: Apply<typeof clearOverride>) =>
    overrideApply(db, actor, input, true),
}

export const setStageChange = {
  preview: (db: DbOrTx, input: In<typeof setStage>) =>
    release.previewStage(db, input.key, input.stage),
  apply: (db: DbOrTx, actor: PlatformActor, input: Apply<typeof setStage>) =>
    release.setStage(db, actor, { key: input.key, stage: input.stage, ...common(input) }),
}

/** Only the plan's own fields reach the operation. */
function definitionOf(input: In<typeof publishPlan>): PlanDefinition {
  const { key, name, sortOrder, features, limits, defaultForNew } = input
  return {
    key,
    name,
    sortOrder,
    features,
    limits,
    ...(defaultForNew !== undefined && { defaultForNew }),
  }
}

export const publishChange = {
  preview: (db: DbOrTx, input: In<typeof publishPlan>) =>
    plans.previewPublish(db, definitionOf(input), input.isNew),
  apply: (db: DbOrTx, actor: PlatformActor, input: Apply<typeof publishPlan>) =>
    plans.publishPlan(db, actor, {
      definition: definitionOf(input),
      isNew: input.isNew,
      ...common(input),
    }),
}

/** The reason and before-state every apply passes on. */
function common<E>(input: { reason: string; expected: E }) {
  return { reason: input.reason, expected: input.expected }
}
