import type { OrganizationRow } from '@vento/shared/console'
import { StatusBadge } from '@/components/status-badge'
import { trialLeft } from '../words'

/** "Enterprise · 9 days left" in blue, or nothing. */
export function TrialBadge({ trial }: { trial: OrganizationRow['trial'] }) {
  if (!trial) return null
  return (
    <StatusBadge tone="blue">
      {trial.planName} · {trialLeft(trial.endsOn)}
    </StatusBadge>
  )
}

/** Rose, with words: more companies or people than the plan allows (nothing is archived). */
export function OverLimitBadge({ over }: { over: boolean }) {
  return over ? <StatusBadge tone="rose">Over a limit</StatusBadge> : null
}
