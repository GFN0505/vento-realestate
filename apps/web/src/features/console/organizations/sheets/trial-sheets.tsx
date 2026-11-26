import { useQuery } from '@tanstack/react-query'
import { trialDays } from '@vento/shared/console'
import { useId, useState } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { consoleClient } from '../../api'
import { ChangeSheet } from '../../changes/change-sheet'
import { ChoiceList } from '../../changes/choice-list'
import { useChange } from '../../changes/use-change'
import { plansQuery } from '../../plans/queries'
import type { SheetProps } from './organization-changes'

const start = consoleClient.console.organizations.startTrial
const end = consoleClient.console.organizations.endTrial
const DEFAULT_DAYS = '30'

/** Start trial (spec): the next plan up and 30 days preselected. */
export function StartTrialSheet({ org, onClose, onNext }: SheetProps) {
  const plans = useQuery(plansQuery()).data
  const sorted = [...(plans ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const current = sorted.findIndex((p) => p.key === org.plan?.key)
  const nextUp = sorted[current + 1] ?? sorted.at(-1)
  const [planKey, setPlanKey] = useState<string | undefined>(undefined)
  const [days, setDays] = useState(DEFAULT_DAYS)
  const [daysError, setDaysError] = useState<string | null>(null)
  const daysId = useId()
  const chosen = sorted.find((p) => p.key === (planKey ?? nextUp?.key))
  const change = useChange(start, onClose)

  function checkDays(): number | null {
    const parsed = trialDays.safeParse(Number(days.trim()))
    const problem =
      days.trim() === '' ? 'A trial lasts 1 to 90 days.' : parsed.error?.issues[0]?.message
    setDaysError(problem ?? null)
    return parsed.success && !problem ? parsed.data : null
  }

  const shownDays = Number(days) || 30
  return (
    <ChangeSheet
      open
      onClose={onClose}
      onNext={onNext}
      change={change}
      title="Start trial"
      description={org.name}
      reviewTitle={chosen ? `Start a ${shownDays}-day ${chosen.name} trial?` : undefined}
      confirmLabel={`Start ${shownDays}-day trial`}
      fieldsDirty={planKey !== undefined || days !== DEFAULT_DAYS}
      onReview={() => {
        const n = checkDays()
        if (n === null) return document.getElementById(daysId)?.focus()
        if (chosen) void change.preview({ organizationId: org.id, planKey: chosen.key, days: n })
      }}
      fields={
        !plans ? (
          <Skeleton aria-hidden className="h-40 w-full rounded-lg" />
        ) : (
          <>
            <ChoiceList
              legend="Plan"
              value={chosen?.key}
              onChange={setPlanKey}
              choices={sorted.map((p) => ({ value: p.key, label: p.name }))}
            />
            <Field data-invalid={!!daysError} className="max-w-40">
              <FieldLabel htmlFor={daysId}>Days</FieldLabel>
              <Input
                id={daysId}
                name="days"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={days}
                onChange={(event) => setDays(event.target.value)}
                onBlur={() => days.trim() !== '' && checkDays()}
                aria-invalid={!!daysError}
                aria-describedby={daysError ? `${daysId}-error` : `${daysId}-help`}
              />
              <FieldError id={`${daysId}-error`} role="alert">
                {daysError}
              </FieldError>
              <FieldDescription id={`${daysId}-help`}>1 to 90 days.</FieldDescription>
            </Field>
          </>
        )
      }
    />
  )
}

/** End trial: no fields; the preview says which features stop. */
export function EndTrialSheet({ org, onClose }: SheetProps) {
  const change = useChange(end, onClose)
  const name = org.trial?.planName ?? 'the'
  return (
    <ChangeSheet
      open
      onClose={onClose}
      change={change}
      title={`End the ${name} trial?`}
      description={org.name}
      confirmLabel="End trial"
      destructive
      autoPreview={() => void change.preview({ organizationId: org.id })}
    />
  )
}
