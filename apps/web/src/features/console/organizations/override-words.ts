import { featureLabel } from '@vento/shared'
import type { ConsoleOverride } from '@vento/shared/console'
import { formatDate } from '@/lib/format'
import { count, LIMIT_LABEL, naira } from '../words'

/** "Commissions · on", "Companies limit · 8", "AI budget · ₦200,000 a month". */
export function overrideWhat(o: ConsoleOverride): string {
  if (o.kind !== 'limit') return `${featureLabel(o.key)} · ${o.enabled ? 'on' : 'off'}`
  if (o.key === 'ai_budget') {
    return `AI budget · ${o.value === null ? 'unlimited' : `${naira(o.value)} a month`}`
  }
  const value = o.value === null ? 'unlimited' : count(Number(o.value))
  return `${LIMIT_LABEL[o.key]} limit · ${value}`
}

/** A release override changes availability; feature and limit overrides change the plan. */
export const overrideKind = (o: ConsoleOverride) => (o.kind === 'release' ? 'Early access' : 'Plan')

export const overrideUntil = (o: ConsoleOverride) =>
  o.until ? `until ${formatDate(o.until)}` : 'no end date'

export const overrideBy = (o: ConsoleOverride) =>
  `${o.byName ?? 'Vento Real Estate (scheduled)'} · ${formatDate(o.at)}`
