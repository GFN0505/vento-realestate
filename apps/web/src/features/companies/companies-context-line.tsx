import type { ListEntitiesOutput } from '@vento/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { TalkToVentoButton } from '@/features/plan/talk-to-vento-button'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "3 active companies · 1 archived". */
export function companiesCountLine(counts: ListEntitiesOutput['counts']): string {
  const active = plural(counts.active, 'active company', 'active companies')
  return counts.archived > 0 ? `${active} · ${counts.archived} archived` : active
}

/**
 * Under the title. Owners on a plan with a company limit read "2 of 2 active companies on your
 * Starter plan" (plus Talk to Vento at the limit); nobody else ever sees a plan name.
 */
export function CompaniesContextLine({
  counts,
}: {
  counts: ListEntitiesOutput['counts'] | undefined
}) {
  const me = useMe()
  const { showUpgradeHints } = useEffectiveAccess()
  const limit = showUpgradeHints ? me.plan?.limits.find((l) => l.key === 'entities') : undefined
  if (limit && limit.included !== null) {
    const onPlan = me.plan?.name ? ` on your ${me.plan.name} plan` : ''
    return (
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        {limit.used} of {plural(limit.included, 'active company', 'active companies')}
        {onPlan}
        {limit.used >= limit.included && (
          <TalkToVentoButton about="more companies" className="-my-1 h-6 px-2" />
        )}
      </span>
    )
  }
  if (!counts) return <Skeleton aria-hidden className="inline-block h-3.5 w-40 align-middle" />
  return companiesCountLine(counts)
}
