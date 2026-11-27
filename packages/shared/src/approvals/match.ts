import { Decimal } from '../common/decimal'
import { type ApprovalActionKey, ruleActionKey } from './catalog'
import { formatAmount } from './copy'

/** The parts of a rule the matcher reads; the API's rows and the rules page both fit it. */
export type MatchableRule = {
  actionKey: ApprovalActionKey
  /** "Over" this NGN amount (decimal string); null = any amount. */
  minAmount: string | null
  /** 'all' = every company; otherwise the companies the rule names. */
  entityIds: 'all' | readonly string[]
}

export type MatchQuery = {
  actionKey: ApprovalActionKey
  /** The request's company; null for organization-wide actions (roles, owners). */
  entityId: string | null
  /** The amount in NGN (a foreign amount at the rate the module recorded); null = no amount. */
  ngnAmount: string | null
}

/**
 * The one rule that applies, or null (the action runs at once). The company's own rules replace
 * the all-company ones entirely, so a company rule can loosen them as well as tighten them
 * (plan question 4). Within that tier the highest threshold the amount is strictly over wins,
 * and an "any amount" rule matches only when no threshold does.
 */
export function matchRule<R extends MatchableRule>(rules: readonly R[], q: MatchQuery): R | null {
  const key = ruleActionKey(q.actionKey)
  const forAction = rules.filter((r) => r.actionKey === key)
  const entityId = q.entityId
  const own =
    entityId === null
      ? []
      : forAction.filter((r) => r.entityIds !== 'all' && r.entityIds.includes(entityId))
  const tier = own.length > 0 ? own : forAction.filter((r) => r.entityIds === 'all')
  return bestInTier(tier, q.ngnAmount)
}

function bestInTier<R extends MatchableRule>(
  tier: readonly R[],
  ngnAmount: string | null,
): R | null {
  let best: { rule: R; over: Decimal } | null = null
  if (ngnAmount !== null) {
    const amount = new Decimal(ngnAmount)
    for (const rule of tier) {
      if (rule.minAmount === null) continue
      const over = new Decimal(rule.minAmount)
      // "Over" is strict: an amount equal to the threshold doesn't need this rule.
      if (amount.gt(over) && (best === null || over.gt(best.over))) best = { rule, over }
    }
  }
  return best?.rule ?? tier.find((r) => r.minAmount === null) ?? null
}

/**
 * The muted line under an action's rules: "Below ₦5,000,000: no approval needed". Null when an
 * "any amount" rule covers everything, or there are no rules. Pass one scope's rules.
 */
export function belowThresholdLine(
  rules: readonly Pick<MatchableRule, 'minAmount'>[],
): string | null {
  const thresholds: Decimal[] = []
  for (const r of rules) {
    if (r.minAmount === null) return null
    thresholds.push(new Decimal(r.minAmount))
  }
  if (thresholds.length === 0) return null
  const lowest = Decimal.min(...thresholds)
  return `Below ${formatAmount(lowest.toFixed(2), 'NGN')}: no approval needed`
}
