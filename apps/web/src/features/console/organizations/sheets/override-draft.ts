import {
  type CountLimitKey,
  type FeatureKey,
  featureLabel,
  isFeatureKey,
  money,
} from '@vento/shared'
import { limitValue } from '@vento/shared/console'
import { daysUntilInLagos } from '@/lib/format'
import type { OrganizationSearch } from '@/routes/console/-search'
import { cleanNaira } from '../../changes/naira-field'
import { count, LIMIT_LABEL, naira } from '../../words'

/** The Add override form. `target` is a feature key or `limit:{key}`. */
export type OverrideDraft = {
  kind: 'release' | 'plan'
  target: string
  on: boolean
  amount: string
  unlimited: boolean
  /** YYYY-MM-DD, or empty for no end date. */
  until: string
}
export type OverrideErrors = Partial<Record<'target' | 'value' | 'until', string>>

type FeatureInput = {
  organizationId: string
  kind: 'release' | 'feature'
  key: FeatureKey
  value: 'on' | 'off'
  until?: string
}
type CountInput = {
  organizationId: string
  kind: 'limit'
  key: CountLimitKey
  value: number | 'unlimited'
  until?: string
}
type BudgetInput = {
  organizationId: string
  kind: 'limit'
  key: 'ai_budget'
  value: string
  until?: string
}
export type OverrideInput = FeatureInput | CountInput | BudgetInput

/** From a Features row's ⋯ (kind and key in the address), or blank. */
export function initialDraft(prefill: Pick<OrganizationSearch, 'kind' | 'key'>): OverrideDraft {
  const target =
    prefill.kind === 'limit' && prefill.key ? `limit:${prefill.key}` : (prefill.key ?? '')
  return {
    kind: prefill.kind === 'release' || !prefill.kind ? 'release' : 'plan',
    target: isFeatureKey(target) || target.startsWith('limit:') ? target : '',
    on: true,
    amount: '',
    unlimited: false,
    until: '',
  }
}

const COUNT_KEYS: Record<string, CountLimitKey> = {
  'limit:projects': 'projects',
  'limit:entities': 'entities',
  'limit:members': 'members',
}

/** The preview input, or the fields' messages (validate on Review). */
export function readDraft(
  draft: OverrideDraft,
  organizationId: string,
): { input: OverrideInput; errors: null } | { input: null; errors: OverrideErrors } {
  const errors: OverrideErrors = {}
  const until = draft.until || undefined
  if (until && daysUntilInLagos(until) < 0) errors.until = 'Choose today or a later date.'
  const base = { organizationId, ...(until ? { until } : {}) }
  let input: OverrideInput | null = null
  if (isFeatureKey(draft.target)) {
    const kind = draft.kind === 'release' ? 'release' : 'feature'
    input = { ...base, kind, key: draft.target, value: draft.on ? 'on' : 'off' }
  } else if (draft.target === 'limit:ai_budget') {
    const parsed = money.safeParse(cleanNaira(draft.amount))
    if (draft.unlimited) input = { ...base, kind: 'limit', key: 'ai_budget', value: 'unlimited' }
    else if (parsed.success)
      input = { ...base, kind: 'limit', key: 'ai_budget', value: parsed.data }
    else errors.value = 'Enter a monthly budget in naira, or choose Unlimited.'
  } else if (COUNT_KEYS[draft.target]) {
    const parsed = limitValue.safeParse(draft.unlimited ? 'unlimited' : Number(draft.amount))
    const key = COUNT_KEYS[draft.target]
    if (key && parsed.success && (draft.unlimited || draft.amount.trim() !== '')) {
      input = { ...base, kind: 'limit', key, value: parsed.data }
    } else errors.value = 'Enter a whole number, or choose Unlimited.'
  } else errors.target = 'Choose a feature or limit.'
  if (Object.keys(errors).length > 0 || !input) return { input: null, errors }
  return { input, errors: null }
}

/** The confirm button: "Turn Commissions on", "Set companies limit to 8". */
export function overrideConfirmLabel(input: OverrideInput): string {
  if (input.kind !== 'limit') return `Turn ${featureLabel(input.key)} ${input.value}`
  if (input.key === 'ai_budget') {
    return `Set AI budget to ${input.value === 'unlimited' ? 'unlimited' : naira(input.value)}`
  }
  const value = input.value === 'unlimited' ? 'unlimited' : count(input.value)
  return `Set ${LIMIT_LABEL[input.key].toLowerCase()} limit to ${value}`
}
