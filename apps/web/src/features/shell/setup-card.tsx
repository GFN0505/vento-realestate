import { CheckIcon } from 'lucide-react'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { cn } from '@/lib/utils'

type Step = { label: string; detail: string; done: boolean }

/**
 * "Get set up" for owners and admins (ChecklistRow pattern from the Onboarding board). Honest
 * states only: a step is done when the data says so; steps whose screens haven't shipped are
 * upcoming and not clickable. They become links as Team (3b), Finance and Sales arrive.
 */
export function SetupCard() {
  const { options, status } = useCurrentEntity()
  const entities = options.length
  const steps: Step[] = [
    { label: 'Invite your team', detail: 'Arrives with Team settings', done: false },
    {
      label: 'Add your entities',
      detail:
        status === 'success' && entities > 0
          ? `${entities} ${entities === 1 ? 'entity' : 'entities'} added`
          : 'Your holding company and SPVs',
      done: status === 'success' && entities > 0,
    },
    { label: 'Connect Paystack', detail: 'Arrives with Finance', done: false },
    { label: 'Import buyers', detail: 'Arrives with Sales', done: false },
  ]
  const done = steps.filter((s) => s.done).length

  return (
    <section aria-labelledby="setup-title" className="flex flex-col rounded-[10px] border bg-card">
      <div className="flex flex-col gap-2.5 px-5 pt-4 pb-1 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex items-baseline justify-between gap-3 lg:justify-start">
          <h2 id="setup-title" className="font-heading font-semibold text-[15px]">
            Get set up
          </h2>
          <span className="text-muted-foreground text-xs tabular-nums">
            {done} of {steps.length} done
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Set-up progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          className="h-1.5 overflow-hidden rounded-full bg-muted lg:w-40"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
      </div>
      {/* A compact strip on desktop (one row of four), a list on phones. */}
      <ol className="grid py-1.5 lg:grid-cols-4 lg:px-2 lg:pb-3">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3 px-5 py-2.5 lg:px-3">
            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                step.done
                  ? 'border-status-emerald bg-status-emerald text-card'
                  : 'border-dashed border-input-hover',
              )}
            >
              {step.done && <CheckIcon className="size-3" strokeWidth={3} />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cn('font-medium text-[13px]', step.done && 'text-muted-foreground')}>
                {step.label}
                <span className="sr-only">{step.done ? ', done' : ', not yet available'}</span>
              </span>
              <span className="truncate text-muted-foreground text-xs">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
