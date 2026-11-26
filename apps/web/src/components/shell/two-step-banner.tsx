import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { ShieldAlertIcon } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/preview/use-effective-permissions'
import { daysAgoInLagos } from '@/lib/format'
import { twoStepSetupUi, useTwoStepSetupOffered } from '@/lib/two-step-setup-ui'

const TurnOnSheet = lazy(() =>
  import('@/features/security/dialogs/turn-on-sheet').then((m) => ({ default: m.TurnOnSheet })),
)

/**
 * "{Organization} now requires two-step sign-in" (spec), for members without two-step while the
 * organization's 7 days run. Above the top bar, like the preview banner; the setup opens over the
 * page, so whatever is on it stays.
 */
export function TwoStepBanner() {
  const me = useMe()
  if (!me.twoStepSetupBy) return null
  const organization = me.twoStepRequiredBy?.organizationName ?? me.organization?.name ?? ''
  // The deadline's own Lagos day is the last one.
  const lastDay = daysAgoInLagos(me.twoStepSetupBy) >= 0
  return (
    <div
      role="status"
      className="flex min-h-11 items-center gap-3 border-status-amber-border border-b bg-status-amber-bg px-4 py-1.5 text-[13px] text-status-amber-fg lg:px-6"
    >
      <ShieldAlertIcon aria-hidden className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {lastDay ? (
          <span className="font-semibold">Set up two-step today to keep using {organization}.</span>
        ) : (
          <>
            <span className="font-semibold">{organization} now requires two-step sign-in.</span>{' '}
            <span className="max-sm:hidden">
              Set it up now, or you'll be asked at your next sign-in.
            </span>
          </>
        )}
      </p>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 max-md:h-9"
        onClick={twoStepSetupUi.open}
      >
        Set up two-step
      </Button>
    </div>
  )
}

/**
 * The setup sheet over the page, mounted on first open and kept to animate out. Required (and
 * not closable) exactly while `me.nextStep` says so: the 7 days ran out, or a request was
 * refused and `me` was refetched. It closes by itself once `me` is ready again.
 */
export function TwoStepSetupHost() {
  const me = useMe()
  const offered = useTwoStepSetupOffered()
  const required = me.nextStep === 'two_step_setup'
  const router = useRouter()
  const queryClient = useQueryClient()
  const [used, setUsed] = useState(false)
  const open = offered || required
  if (open && !used) setUsed(true)
  if (!used) return null
  return (
    <Suspense fallback={null}>
      <TurnOnSheet
        open={open}
        required={required}
        onClose={twoStepSetupUi.close}
        onDone={() => {
          twoStepSetupUi.close()
          // Whatever was refused while two-step was missing loads now.
          void router.invalidate()
          void queryClient.invalidateQueries()
        }}
      />
    </Suspense>
  )
}
