import { HourglassIcon } from 'lucide-react'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { TalkToVentoButton } from './talk-to-vento-button'
import { trialEndingSoon, trialLineText } from './trial-copy'

/**
 * Home, owners only, in a trial's last 7 days: when it ends, what goes, and that the data stays.
 * A preview of another role hides it, as that role would see Home.
 */
export function TrialLine({ now }: { now?: Date }) {
  const me = useMe()
  const { showUpgradeHints } = useEffectiveAccess()
  const trial = me.plan?.trial ?? null
  if (!showUpgradeHints || !trialEndingSoon(trial, now)) return null

  return (
    <section
      aria-label="Your trial"
      className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-highlight text-link"
        >
          <HourglassIcon className="size-4" strokeWidth={1.9} />
        </span>
        <p className="text-pretty text-[13px] leading-relaxed">{trialLineText(trial)}</p>
      </div>
      <TalkToVentoButton
        about={`the ${trial.planName} trial`}
        className="self-start max-md:h-11 max-md:w-full sm:self-auto"
      />
    </section>
  )
}
