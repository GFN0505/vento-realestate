import type { OrganizationDetail } from '@vento/shared/console'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CardNote, DetailCard, FactRow } from '../ui/detail-card'
import { LIMIT_LABEL, limitState, limitText, SHOWN_LIMITS } from '../words'
import { useOrganizationSearch } from './use-organization-search'

const REFUSED: Record<string, string> = {
  projects: 'new projects are refused',
  entities: 'new companies are refused',
  members: 'new invitations are refused',
}

/** Plan and version, a newer version to move to, and limits with use (spec "Plan card"). */
export function PlanCard({ org }: { org: OrganizationDetail }) {
  const { openChange } = useOrganizationSearch()
  const internal = org.releaseGroup === 'internal'
  const limits = org.limits.filter((l) => SHOWN_LIMITS.includes(l.key))
  return (
    <DetailCard title="Plan">
      {internal ? (
        <CardNote>Internal: every feature, no limits</CardNote>
      ) : org.plan ? (
        <FactRow label="Plan">
          {org.plan.name} v{org.plan.version}
        </FactRow>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 py-1">
          <span className="font-semibold text-[13px] text-status-amber-fg">No plan</span>
          <Button size="sm" onClick={() => openChange('plan')} className="max-md:h-11">
            Choose a plan
          </Button>
        </div>
      )}
      {!internal && org.plan && org.plan.latestVersion > org.plan.version && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t py-2 text-[13px]">
          <span className="text-status-blue-fg">
            {org.plan.name} v{org.plan.latestVersion} is available
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => openChange('plan')}
            className="max-md:h-11"
          >
            Move to v{org.plan.latestVersion}
          </Button>
        </div>
      )}
      {limits.map((limit) => {
        const state = internal ? 'within' : limitState(limit)
        const shown = internal ? { ...limit, included: null } : limit
        return (
          <div key={limit.key} className="border-t first:border-t-0">
            <FactRow
              label={LIMIT_LABEL[limit.key]}
              className={cn(
                'border-t-0',
                state === 'at' && '[&>span:last-child]:text-status-amber-fg',
                state === 'over' && '[&>span:last-child]:text-status-rose-fg',
              )}
            >
              {limitText(shown)}
            </FactRow>
            {state === 'over' && (
              <p className="-mt-1 pb-2 text-right text-status-rose-fg text-xs">
                Nothing is archived; {REFUSED[limit.key]}.
              </p>
            )}
          </div>
        )
      })}
    </DetailCard>
  )
}
