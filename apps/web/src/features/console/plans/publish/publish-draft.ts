import {
  FEATURE_KEYS,
  type FeatureKey,
  isPlanFeature,
  type PlanDefinition,
  planDefinition,
} from '@vento/shared'
import type { PlanDetail } from '@vento/shared/console'
import { cleanNaira } from '../../changes/naira-field'

/** A count limit as typed: a number, or Unlimited (sent as a missing key). */
export type LimitDraft = { text: string; unlimited: boolean }

export type PublishDraft = {
  key: string
  name: string
  sortOrder: string
  defaultForNew: boolean
  features: FeatureKey[]
  entities: LimitDraft
  members: LimitDraft
  /** Not shown until the projects module counts them; carried over from the latest version. */
  projects: number | undefined
  aiBudget: string
}

export type PublishErrors = Partial<
  Record<'key' | 'name' | 'sortOrder' | 'features' | 'entities' | 'members' | 'aiBudget', string>
>

/** Features a plan can list (not core, not an add-on), in catalog order. */
export const PLAN_FEATURES = FEATURE_KEYS.filter(isPlanFeature)

const limitDraft = (value: number | undefined): LimitDraft =>
  value === undefined ? { text: '', unlimited: true } : { text: String(value), unlimited: false }

/** The next version starts from the latest one (spec); a new plan starts empty. */
export function initialPublishDraft(plan: PlanDetail | null): PublishDraft {
  const latest = plan ? [...plan.versions].sort((a, b) => b.version - a.version)[0] : undefined
  return {
    key: plan?.key ?? '',
    name: plan?.name ?? '',
    sortOrder: String(plan?.sortOrder ?? 10),
    defaultForNew: plan?.defaultForNew ?? false,
    features: latest ? latest.features.filter(isPlanFeature) : [],
    entities: limitDraft(latest?.limits.entities),
    members: limitDraft(latest?.limits.members),
    projects: latest?.limits.projects,
    aiBudget: latest ? latest.limits.ai_budget.replace(/\.00$/, '') : '150000',
  }
}

function limit(draft: LimitDraft): number | undefined | 'invalid' {
  if (draft.unlimited) return undefined
  const n = Number(draft.text)
  return draft.text.trim() === '' || !Number.isInteger(n) || n < 0 ? 'invalid' : n
}

/** The definition to preview, or each field's message (the shared plan rules decide). */
export function readPublishDraft(
  draft: PublishDraft,
): { definition: PlanDefinition; errors: null } | { definition: null; errors: PublishErrors } {
  const errors: PublishErrors = {}
  const entities = limit(draft.entities)
  const members = limit(draft.members)
  if (entities === 'invalid') errors.entities = 'Enter a whole number, or choose Unlimited.'
  if (members === 'invalid') errors.members = 'Enter a whole number, or choose Unlimited.'
  const parsed = planDefinition.safeParse({
    key: draft.key.trim(),
    name: draft.name.trim(),
    sortOrder: Number(draft.sortOrder),
    features: draft.features,
    limits: {
      ...(draft.projects === undefined ? {} : { projects: draft.projects }),
      ...(typeof entities === 'number' ? { entities } : {}),
      ...(typeof members === 'number' ? { members } : {}),
      ai_budget: cleanNaira(draft.aiBudget),
    },
    defaultForNew: draft.defaultForNew,
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [first, second] = issue.path
      const field = first === 'limits' ? (second === 'ai_budget' ? 'aiBudget' : undefined) : first
      if (field === 'key' || field === 'name' || field === 'features' || field === 'aiBudget') {
        errors[field] ??= field === 'name' ? 'Use 2 to 40 characters.' : issue.message
      }
      if (field === 'sortOrder') errors.sortOrder ??= 'Use a whole number from 1 to 100.'
    }
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { definition: null, errors }
  return { definition: parsed.data, errors: null }
}

export const PUBLISH_FIELD_ORDER = [
  'key',
  'name',
  'features',
  'entities',
  'members',
  'aiBudget',
  'sortOrder',
] as const
