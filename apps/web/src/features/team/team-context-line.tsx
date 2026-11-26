import type { ListTeamOutput } from '@vento/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { TalkToVentoButton } from '@/features/plan/talk-to-vento-button'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { peopleLimit, usageLine } from './invite/plan-places'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "8 people · 3 invited". */
export function teamCountLine(counts: ListTeamOutput['counts']): string {
  const people = plural(counts.members, 'person', 'people')
  return counts.invited > 0 ? `${people} · ${counts.invited} invited` : people
}

/**
 * Under the title. Owners on a plan with a people limit read "8 of 10 people on your Starter
 * plan" (plus Talk to Vento at the limit); nobody else ever sees a plan name. The line keeps its
 * height while loading.
 */
export function TeamContextLine({ counts }: { counts: ListTeamOutput['counts'] | undefined }) {
  const me = useMe()
  const { showUpgradeHints } = useEffectiveAccess()
  const limit = showUpgradeHints ? peopleLimit(me.plan) : null
  if (!counts && !limit) {
    return <Skeleton aria-hidden className="inline-block h-3.5 w-36 align-middle" />
  }
  if (limit) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {usageLine(limit)}
        {limit.used >= limit.included && (
          <TalkToVentoButton about="more people" className="-my-1 h-6 px-2" />
        )}
      </span>
    )
  }
  return counts ? teamCountLine(counts) : null
}
