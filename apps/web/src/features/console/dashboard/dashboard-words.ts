import type { AttentionItem, Dashboard, FeedRow } from '@vento/shared/console'
import { daysAgoInLagos, daysUntilInLagos, formatDate } from '@/lib/format'
import { count, LIMIT_LABEL, plural } from '../words'

export type Tone = 'rose' | 'amber' | 'slate'

/** "just now", "12 min ago", "2 h ago", then "yesterday", "3 days ago", "12 Nov 2026". */
export function ago(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const days = daysAgoInLagos(iso, now)
  if (days <= 0) return `${Math.floor(minutes / 60)} h ago`
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(iso)
}

/** "ends today", "ends tomorrow", "ends in 2 days" (`endsOn` is the trial's last day). */
export function endsIn(endsOn: string, now: Date = new Date()): string {
  const days = daysUntilInLagos(endsOn, now)
  if (days <= 0) return 'ends today'
  if (days === 1) return 'ends tomorrow'
  return `ends in ${days} days`
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1)

export type AttentionWords = {
  text: string
  tone: Tone
  action: 'review' | 'choose_plan'
}

/** One Needs attention row in words (spec §2's table). */
export function attentionWords(item: AttentionItem, now: Date = new Date()): AttentionWords {
  switch (item.kind) {
    case 'command_line':
      return {
        text: `${item.actorName} ${lowerFirst(item.summary)} from the command line · ${ago(item.at, now)}`,
        tone: 'rose',
        action: 'review',
      }
    case 'trial_ending':
      return {
        text: `${item.organization.name} · ${item.planName} trial ${endsIn(item.endsOn, now)}`,
        tone: 'amber',
        action: 'review',
      }
    case 'over_limit':
      return {
        text: `${item.organization.name} · ${LIMIT_LABEL[item.limit]} ${count(item.used)} of ${count(item.included)}`,
        tone: 'rose',
        action: 'review',
      }
    case 'no_plan':
      return { text: `${item.organization.name} · No plan`, tone: 'amber', action: 'choose_plan' }
    case 'quiet':
      return {
        text: `${item.organization.name} · nobody active for ${plural(item.days, 'day')}`,
        tone: 'slate',
        action: 'review',
      }
  }
}

/** What happened, in words: "3 people joined", "sign-in locked after wrong codes". */
export function feedWhat(row: Pick<FeedRow, 'kind' | 'count'>): {
  text: string
  tone: Exclude<Tone, 'slate'> | null
} {
  const n = row.count
  switch (row.kind) {
    case 'signed_up':
      return { text: 'signed up', tone: null }
    case 'added_company':
      return { text: n === 1 ? 'added a company' : `added ${count(n)} companies`, tone: null }
    case 'people_joined':
      return { text: `${plural(n, 'person', 'people')} joined`, tone: null }
    case 'people_removed':
      return { text: `${plural(n, 'person', 'people')} removed`, tone: null }
    case 'new_owner':
      return { text: n === 1 ? 'new owner' : `${count(n)} new owners`, tone: null }
    case 'two_step_reset':
      return { text: `two-step reset for ${plural(n, 'person', 'people')}`, tone: null }
    case 'sign_in_locked':
      return { text: 'sign-in locked after wrong codes', tone: 'amber' }
    case 'possible_copied_passkey':
      return { text: 'possible copied passkey', tone: 'rose' }
  }
}

/** "6 new organizations · 41 invitations sent, 28 accepted · 2 trials started · …". */
export function summaryLine(summary: Dashboard['activity']['summary']): string {
  return [
    `${plural(summary.newOrganizations, 'new organization')}`,
    `${plural(summary.invitationsSent, 'invitation')} sent, ${count(summary.invitationsAccepted)} accepted`,
    `${plural(summary.trialsStarted, 'trial')} started`,
    `${plural(summary.signUpsNotFinished, 'sign-up')} not finished`,
  ].join(' · ')
}

/** "47 on v2 · 3 on v1". */
export function versionsWords(versions: readonly { version: number; organizations: number }[]) {
  return versions.map((v) => `${count(v.organizations)} on v${v.version}`).join(' · ')
}
