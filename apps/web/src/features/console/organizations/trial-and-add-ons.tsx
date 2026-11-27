import type { OrganizationDetail } from '@vento/shared/console'
import { Button } from '@/components/ui/button'
import { daysUntilInLagos, formatDate, formatDayMonth } from '@/lib/format'
import { CardNote, DetailCard, FactRow } from '../ui/detail-card'
import { naira } from '../words'
import { useOrganizationSearch } from './use-organization-search'

type Trial = NonNullable<OrganizationDetail['trial']>

/** "Enterprise trial · ends 2 Jan 2027 (9 days)". */
export function trialHeadline(trial: Trial, now: Date = new Date()): string {
  const days = daysUntilInLagos(trial.endsOn, now)
  const left = days <= 0 ? 'today' : days === 1 ? '1 day' : `${days} days`
  return `${trial.planName} trial · ends ${formatDate(trial.endsOn)} (${left})`
}

/** Shown only during a trial: when it ends, the reminders sent, **End trial**. */
export function TrialCard({ trial }: { trial: Trial }) {
  const { openChange } = useOrganizationSearch()
  return (
    <DetailCard
      title="Trial"
      actions={
        <Button
          size="sm"
          variant="outline"
          onClick={() => openChange('end-trial')}
          className="max-md:h-11"
        >
          End trial
        </Button>
      }
    >
      <p className="py-1 font-semibold text-[13px] tabular-nums">{trialHeadline(trial)}</p>
      <FactRow label="7 days before">
        {trial.sevenDayReminderAt
          ? `Sent ${formatDayMonth(trial.sevenDayReminderAt)}`
          : 'Not sent yet'}
      </FactRow>
      <FactRow label="1 day before">
        {trial.oneDayReminderAt ? `Sent ${formatDayMonth(trial.oneDayReminderAt)}` : 'Not sent yet'}
      </FactRow>
    </DetailCard>
  )
}

/** "AI · ₦150,000 a month · since 1 Nov 2026", or "No add-ons" with **Add AI**. */
export function AddOnsCard({ addOns }: { addOns: OrganizationDetail['addOns'] }) {
  const { openChange } = useOrganizationSearch()
  const ai = addOns.find((a) => a.key === 'ai')
  return (
    <DetailCard
      title="Add-ons"
      actions={
        ai ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => openChange('remove-ai')}
              className="max-md:h-11"
            >
              Remove
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => openChange('ai-budget')}
              className="max-md:h-11"
            >
              Change budget
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => openChange('add-ai')}
            className="max-md:h-11"
          >
            Add AI
          </Button>
        )
      }
    >
      {ai ? (
        <p className="py-1 text-[13px] tabular-nums">
          <span className="font-semibold">AI</span> · {naira(ai.budget)} a month · since{' '}
          {formatDate(ai.since)}
        </p>
      ) : (
        <CardNote>No add-ons</CardNote>
      )}
    </DetailCard>
  )
}
