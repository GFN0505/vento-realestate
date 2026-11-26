import type { MePlan } from '@vento/shared'
import { daysUntilInLagos, formatDate } from '@/lib/format'

type Trial = NonNullable<MePlan['trial']>

/** The line shows in the trial's last 7 days, including the day it ends (spec). */
export const TRIAL_NOTICE_DAYS = 7

/** The trial ends within the notice window and hasn't ended yet. `endsOn` is its last day. */
export function trialEndingSoon(trial: Trial | null, now: Date = new Date()): trial is Trial {
  if (!trial) return false
  const days = daysUntilInLagos(trial.endsOn, now)
  return days >= 0 && days <= TRIAL_NOTICE_DAYS
}

/** "Board pack" → "board pack"; "HR & payroll" keeps its capitals. */
function inSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label
}

const MAX_NAMED = 3

/** "the board pack is", "commissions and tax are", "a, b, c and 4 more are". */
function losingPhrase(labels: readonly string[]): string {
  const names = labels.map(inSentence)
  if (names.length === 1) {
    const [name = ''] = names
    // "the commissions are", "the board pack is": plural labels end in a plain s.
    return `the ${name} ${/[^s]s$/.test(name) ? 'are' : 'is'}`
  }
  const shown = names.length > MAX_NAMED ? names.slice(0, MAX_NAMED) : names.slice(0, -1)
  const last = names.length > MAX_NAMED ? `${names.length - MAX_NAMED} more` : names.at(-1)
  return `${shown.join(', ')} and ${last} are`
}

/**
 * "Your Enterprise trial ends on 2 Jan 2027. After that, the board pack is no longer available.
 * Your data stays." (spec UI copy).
 */
export function trialLineText(trial: Trial): string {
  const ends = `Your ${trial.planName} trial ends on ${formatDate(trial.endsOn)}.`
  if (trial.losing.length === 0) return ends
  return `${ends} After that, ${losingPhrase(trial.losing)} no longer available. Your data stays.`
}
