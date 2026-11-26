import { featureLabel, isFeatureKey, isLimitKey } from '@vento/shared'
import { LIMIT_WORDS } from '../limit-words'

// One platform audit event in words. Activity, the stale-preview message and (with break-glass)
// the email subject all use this, so the three always say the same thing.

export type DescribableEvent = {
  action: string
  targetType: string
  targetKey: string | null
  before: unknown
  after: unknown
  /** The organization's name, when the event names one. */
  organizationName: string | null
}

export type EventWords = {
  /** "Moved Sales to pilot". */
  summary: string
  /** "internal → pilot"; null when there's no before and after to show. */
  change: string | null
}

function field(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null
  const v = (value as Record<string, unknown>)[key]
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null
}

function featureName(key: string | null): string {
  if (!key) return 'a feature'
  return isFeatureKey(key) ? featureLabel(key) : key
}

/** "₦150,000" from a stored decimal string. */
function nairaText(amount: string): string {
  const n = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 2 }).format(
    amount as Intl.StringNumericLiteral,
  )
  return `₦${n}`
}

function limitText(key: string, value: string | null): string {
  if (value === null || value === 'unlimited') return 'unlimited'
  if (key === 'ai_budget') return `${nairaText(value)} a month`
  return String(Math.floor(Number(value)))
}

function arrow(before: string | null, after: string | null): string | null {
  return before !== null || after !== null ? `${before ?? 'none'} → ${after ?? 'none'}` : null
}

function onOff(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null
  const v = (value as Record<string, unknown>)[key]
  return typeof v === 'boolean' ? (v ? 'on' : 'off') : null
}

function aiBudget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const increases = (value as { limitIncreases?: unknown }).limitIncreases
  const budget = field(increases, 'ai_budget') ?? field(value, 'budget')
  return budget === null ? null : `${nairaText(budget)} a month`
}

export function describePlatformEvent(e: DescribableEvent): EventWords {
  const org = e.organizationName ?? 'an organization'
  const feature = featureName(e.targetKey)
  switch (e.action) {
    case 'release.stage_changed':
      return {
        summary: `Moved ${feature} to ${field(e.after, 'stage') ?? 'a new stage'}`,
        change: arrow(field(e.before, 'stage'), field(e.after, 'stage')),
      }
    case 'release.group_changed':
      return {
        summary: `Moved ${org} to the ${field(e.after, 'releaseGroup') ?? 'new'} group`,
        change: arrow(field(e.before, 'releaseGroup'), field(e.after, 'releaseGroup')),
      }
    case 'release.override_set':
      return {
        summary: `Released ${feature} ${onOff(e.after, 'enabled') ?? 'on'} for ${org}`,
        change: arrow(onOff(e.before, 'enabled'), onOff(e.after, 'enabled')),
      }
    case 'release.override_cleared':
      return { summary: `Cleared ${org}'s release override for ${feature}`, change: null }
    case 'plan.published': {
      const name = field(e.after, 'name') ?? e.targetKey ?? 'a plan'
      const version = field(e.after, 'version')
      return { summary: `Published ${name}${version ? ` v${version}` : ''}`, change: null }
    }
    case 'plan.assigned':
      return {
        summary: `Moved ${org} to ${field(e.after, 'plan') ?? 'a new plan'}`,
        change: arrow(field(e.before, 'plan'), field(e.after, 'plan')),
      }
    case 'plan.trial_started': {
      const plan = (field(e.after, 'plan') ?? '').replace(/ v\d+$/, '')
      return { summary: `Started ${plan ? `a ${plan}` : 'a'} trial for ${org}`, change: null }
    }
    case 'plan.trial_cancelled':
      return { summary: `Ended ${org}'s trial`, change: null }
    case 'plan.trial_ended':
      return { summary: `${org}'s trial ended`, change: null }
    case 'plan.add_on_added':
      return { summary: `Added AI to ${org}`, change: arrow(null, aiBudget(e.after)) }
    case 'plan.add_on_changed':
      return {
        summary: `Changed ${org}'s AI budget`,
        change: arrow(aiBudget(e.before), aiBudget(e.after)),
      }
    case 'plan.add_on_removed':
      return { summary: `Removed AI from ${org}`, change: null }
    case 'plan.feature_overridden':
      return {
        summary: `Turned ${feature} ${onOff(e.after, 'enabled') ?? 'on'} in ${org}'s plan`,
        change: arrow(onOff(e.before, 'enabled'), onOff(e.after, 'enabled')),
      }
    case 'plan.limit_overridden': {
      const key = e.targetKey ?? ''
      const words = isLimitKey(key) ? LIMIT_WORDS[key].many : key
      const before = field(e.before, 'limit')
      const after = field(e.after, 'limit')
      return {
        summary: `Set ${org}'s ${words} limit to ${limitText(key, after)}`,
        change: before === null ? null : arrow(limitText(key, before), limitText(key, after)),
      }
    }
    case 'plan.override_cleared': {
      const key = e.targetKey ?? ''
      const what = isLimitKey(key) ? `${LIMIT_WORDS[key].many} limit` : featureName(key)
      return { summary: `Cleared ${org}'s override for ${what}`, change: null }
    }
    case 'superadmin.granted':
      return {
        summary: `Made ${field(e.after, 'name') ?? 'someone'} a super-admin`,
        change: null,
      }
    case 'superadmin.revoked':
      return {
        summary: `Removed ${field(e.before, 'name') ?? 'someone'} as a super-admin`,
        change: null,
      }
    default:
      return { summary: e.action, change: null }
  }
}
