import type { AttentionItem } from '@vento/shared/console'
import { describe, expect, it } from 'vitest'
import { ago, attentionWords, feedWhat, summaryLine, versionsWords } from './dashboard-words'

const now = new Date('2026-11-27T12:00:00+01:00')
const org = { id: '019a0000-0000-7000-8000-000000000001', name: 'Lekki Partners Ltd' }

describe('Needs attention in words', () => {
  it('says when a trial ends and how far over a limit is', () => {
    const trial: AttentionItem = {
      kind: 'trial_ending',
      organization: org,
      planName: 'Enterprise',
      endsOn: '2026-11-29',
    }
    expect(attentionWords(trial, now)).toEqual({
      text: 'Lekki Partners Ltd · Enterprise trial ends in 2 days',
      tone: 'amber',
      action: 'review',
    })
    const over: AttentionItem = {
      kind: 'over_limit',
      organization: org,
      limit: 'members',
      used: 17,
      included: 15,
    }
    expect(attentionWords(over, now).text).toBe('Lekki Partners Ltd · People 17 of 15')
  })

  it('names a command-line change and quiet organizations', () => {
    const command: AttentionItem = {
      kind: 'command_line',
      eventId: '019a0000-0000-7000-8000-000000000002',
      at: '2026-11-25T10:00:00+01:00',
      actorName: 'Ada Okafor',
      summary: 'Moved Sales to off',
    }
    expect(attentionWords(command, now).text).toBe(
      'Ada Okafor moved Sales to off from the command line · 2 days ago',
    )
    expect(attentionWords({ kind: 'quiet', organization: org, days: 18 }, now).text).toBe(
      'Lekki Partners Ltd · nobody active for 18 days',
    )
    expect(attentionWords({ kind: 'no_plan', organization: org }, now).action).toBe('choose_plan')
  })
})

describe('customer activity in words', () => {
  it('counts people and names security events with a tone', () => {
    expect(feedWhat({ kind: 'people_joined', count: 3 })).toEqual({
      text: '3 people joined',
      tone: null,
    })
    expect(feedWhat({ kind: 'people_removed', count: 1 }).text).toBe('1 person removed')
    expect(feedWhat({ kind: 'possible_copied_passkey', count: 1 }).tone).toBe('rose')
  })

  it('writes the summary, versions and recent times', () => {
    expect(
      summaryLine({
        newOrganizations: 6,
        invitationsSent: 41,
        invitationsAccepted: 28,
        trialsStarted: 2,
        signUpsNotFinished: 3,
      }),
    ).toBe(
      '6 new organizations · 41 invitations sent, 28 accepted · 2 trials started · 3 sign-ups not finished',
    )
    expect(
      versionsWords([
        { version: 2, organizations: 47 },
        { version: 1, organizations: 3 },
      ]),
    ).toBe('47 on v2 · 3 on v1')
    expect(ago('2026-11-27T10:00:00+01:00', now)).toBe('2 h ago')
    expect(ago('2026-11-26T10:00:00+01:00', now)).toBe('yesterday')
  })
})
