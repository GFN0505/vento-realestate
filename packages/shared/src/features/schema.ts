import { z } from 'zod'
import { money } from '../common/money'
import { isoDate } from '../common/schemas'
import {
  COUNT_LIMIT_KEYS,
  FEATURE_KEYS,
  type FeatureKey,
  isPlanFeature,
  LIMIT_KEYS,
  RELEASE_GROUPS,
  RELEASE_STAGES,
} from './catalog'

export const featureKey = z.enum(FEATURE_KEYS as [FeatureKey, ...FeatureKey[]])
export const limitKey = z.enum(LIMIT_KEYS)
export const countLimitKey = z.enum(COUNT_LIMIT_KEYS)
export const releaseStage = z.enum(RELEASE_STAGES)
export const releaseGroup = z.enum(RELEASE_GROUPS)

const count = z.number().int().min(0).max(1_000_000)

/**
 * A plan's limits. A missing count means unlimited. `ai_budget` (NGN a month) is required, so
 * the AI add-on's budget always has a base and can never read as unlimited.
 */
export const planLimits = z.strictObject({
  projects: count.optional(),
  entities: count.optional(),
  members: count.optional(),
  ai_budget: money,
})
export type PlanLimits = z.infer<typeof planLimits>

/** A plan file for `pnpm plans publish --from plans/growth.json`. */
export const planDefinition = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/, { message: 'Use lower-case letters and _' }),
  name: z.string().trim().min(2).max(40),
  sortOrder: z.number().int().min(1).max(100),
  features: z
    .array(featureKey)
    .refine((keys) => keys.every(isPlanFeature), {
      message: 'Core and add-on features are not listed in plans',
    })
    .refine((keys) => new Set(keys).size === keys.length, { message: 'A feature is listed twice' }),
  limits: planLimits,
  defaultForNew: z.boolean().optional(),
})
export type PlanDefinition = z.infer<typeof planDefinition>

/** A feature available to the organization. Unavailable keys are never sent. */
export const availableFeature = z.object({
  key: featureKey,
  /** Reached through stage internal or pilot, or a release override: show "Early access". */
  earlyAccess: z.boolean(),
})
export type AvailableFeature = z.infer<typeof availableFeature>

/** A count limit with current use. `included` null = unlimited. */
export const planLimitUse = z.object({
  key: countLimitKey,
  included: z.number().int().nullable(),
  used: z.number().int().min(0),
})
export type PlanLimitUse = z.infer<typeof planLimitUse>

/** Released to the organization but not entitled: shown to owners at the point of need only. */
export const upgradeHint = z.object({
  key: featureKey,
  label: z.string(),
  /** "Growth", or "the AI add-on". */
  availableOn: z.string(),
})
export type UpgradeHint = z.infer<typeof upgradeHint>

/** Owners only. Never contains stages, other plans' contents or prices. */
export const mePlan = z.object({
  /** null = no plan assigned. */
  name: z.string().nullable(),
  limits: z.array(planLimitUse),
  /** Monthly AI budget in NGN; null = no AI add-on. */
  aiBudget: money.nullable(),
  trial: z
    .object({
      planName: z.string(),
      endsOn: isoDate,
      /** Labels of what goes when the trial ends, e.g. ["Board pack"]. */
      losing: z.array(z.string()),
    })
    .nullable(),
  upgradeHints: z.array(upgradeHint),
  /** For "Talk to Vento". */
  contact: z.object({ email: z.string(), whatsapp: z.string().nullable() }),
})
export type MePlan = z.infer<typeof mePlan>
