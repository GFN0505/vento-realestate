import {
  type CountLimitKey,
  featureLabel,
  isFeatureKey,
  type PlanLimitUse,
  type ReleaseGroup,
  type ReleaseStage,
} from '@vento/shared'
import { daysUntilInLagos } from '@/lib/format'

/*
 * The console's small sentences, shared by its pages. Plain words only (spec UI copy); no keys,
 * codes or stages as data names on screen except the feature key under its label.
 */

const numbers = new Intl.NumberFormat('en-NG')
export const count = (n: number) => numbers.format(n)
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${count(n)} ${n === 1 ? one : many}`

export const GROUP_LABEL: Record<ReleaseGroup, string> = {
  standard: 'Standard',
  pilot: 'Pilot',
  internal: 'Internal',
}

export const STAGE_LABEL: Record<ReleaseStage, string> = {
  off: 'Off',
  internal: 'Internal',
  pilot: 'Pilot',
  on: 'On',
}
export const STAGE_TONE = { off: 'rose', internal: 'slate', pilot: 'blue', on: 'emerald' } as const

/** Plan column: "Growth v2", "Internal · everything" or "No plan". */
export function planLabel(
  plan: { name: string; version: number } | null,
  group: ReleaseGroup,
): string {
  if (group === 'internal') return 'Internal · everything'
  return plan ? `${plan.name} v${plan.version}` : 'No plan'
}

/** "9 days left", "1 day left", "ends today" (`endsOn` is the trial's last day, Lagos). */
export function trialLeft(endsOn: string, now: Date = new Date()): string {
  const days = daysUntilInLagos(endsOn, now)
  if (days <= 0) return 'ends today'
  return days === 1 ? '1 day left' : `${days} days left`
}

/**
 * Limits shown in the console. Projects are hidden until the projects module counts them (plan
 * §16 question 2, owner's decision): no placeholder numbers.
 */
export const SHOWN_LIMITS: readonly CountLimitKey[] = ['entities', 'members']
export const LIMIT_LABEL: Record<CountLimitKey, string> = {
  projects: 'Projects',
  entities: 'Companies',
  members: 'People',
}

export type LimitState = 'within' | 'at' | 'over'

export function limitState(limit: PlanLimitUse): LimitState {
  if (limit.included === null || limit.used < limit.included) return 'within'
  return limit.used === limit.included ? 'at' : 'over'
}

/** "2 of 3", "11" (no cap), "7 of 5 · over the limit". */
export function limitText(limit: PlanLimitUse): string {
  if (limit.included === null) return count(limit.used)
  const base = `${count(limit.used)} of ${count(limit.included)}`
  return limitState(limit) === 'over' ? `${base} · over the limit` : base
}

/** Naira from a decimal string: "150000.00" → "₦150,000". */
export function naira(amount: string): string {
  const [whole = '0', kobo = '00'] = amount.split('.')
  const shown = `₦${numbers.format(Number(whole))}`
  return kobo === '00' || kobo === '0' ? shown : `${shown}.${kobo.padEnd(2, '0')}`
}

/** "Sales and Finance", "A, B and C". */
export function listWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? ''
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`
}

/** A catalog group: the module's own label, or "Platform". */
export const moduleLabel = (module: string) =>
  isFeatureKey(module) ? featureLabel(module) : 'Platform'
