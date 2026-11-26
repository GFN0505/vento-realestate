import { isLimitKey, type LimitKey } from '@vento/shared'
import { CircleFadingArrowUpIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { dataString, isPlanLimit } from '@/lib/error-data'
import { TalkToVentoButton } from './talk-to-vento-button'

const ABOUT: Record<LimitKey, string> = {
  projects: 'more projects',
  entities: 'more entities',
  members: 'more people',
  ai_budget: 'a bigger AI budget',
}

/** Which limit a plan_limit refusal is about, e.g. `entities`. */
function planLimitKey(error: unknown): LimitKey | null {
  const limit = dataString(error, 'limit')
  return limit && isLimitKey(limit) ? limit : null
}

/**
 * Inline where a create was refused for the plan's limit (Settings → Entities and Team in 3b).
 * The server writes the sentence for the caller's role: owners read what's included and get
 * **Talk to Vento**; everyone else reads who to ask, never a plan name or price. Renders nothing
 * for any other error, so a form can pass its last error straight in.
 */
export function PlanLimitMessage({ error, className }: { error: unknown; className?: string }) {
  if (!isPlanLimit(error)) return null
  const limit = planLimitKey(error)
  return (
    <Alert variant="info" className={className}>
      <CircleFadingArrowUpIcon aria-hidden />
      <AlertDescription className="gap-2.5">
        <p className="text-pretty">{error.message}</p>
        <TalkToVentoButton about={limit ? ABOUT[limit] : 'my plan'} />
      </AlertDescription>
    </Alert>
  )
}
