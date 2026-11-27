import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { featureLabel } from '@vento/shared'
import type { PlanRow, ReleaseDetail } from '@vento/shared/console'
import type { ReactNode } from 'react'
import { plansQuery } from '../plans/queries'
import { DetailCard } from '../ui/detail-card'

const link =
  'rounded-sm font-semibold text-link outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring'

function PlanLinks({ plans }: { plans: readonly PlanRow[] }) {
  if (plans.length === 0) return <span className="text-status-amber-fg">None</span>
  return plans.map((plan, i) => (
    <span key={plan.key}>
      {i > 0 && ', '}
      <Link to="/console/plans/$planKey" params={{ planKey: plan.key }} className={link}>
        {plan.name} v{plan.latestVersion}
      </Link>
    </span>
  ))
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t py-2 first:border-t-0">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

/**
 * Needs, and which plans sell it (spec 1b §3): *Included in* links each plan's latest version,
 * *Not in* lists the rest, and the line says how to change it. The release carries the names of
 * the latest versions that include it; the plan list supplies their keys and versions.
 */
export function NeedsAndPlans({ release }: { release: ReleaseDetail }) {
  const plans = [...(useQuery(plansQuery()).data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
  const included = plans.filter((p) => release.plans.includes(p.name))
  const notIn = plans.filter((p) => !release.plans.includes(p.name))
  const sold = !release.core && !release.addOn
  return (
    <DetailCard title="Needs and plans">
      <dl className="flex flex-col text-[13px]">
        <Row term="Needs">
          <span className="font-semibold">
            {release.needs.length > 0 ? release.needs.map(featureLabel).join(', ') : 'Nothing else'}
          </span>
        </Row>
        <Row term="Included in">
          {release.core ? (
            <span className="font-semibold">Core: in every plan</span>
          ) : release.addOn ? (
            <span className="font-semibold">With the AI add-on</span>
          ) : (
            <PlanLinks plans={included} />
          )}
        </Row>
        {sold && notIn.length > 0 && (
          <Row term="Not in">
            <span>{notIn.map((p) => p.name).join(', ')}</span>
          </Row>
        )}
      </dl>
      {sold && (
        <p className="border-t pt-2 pb-1 text-muted-foreground text-xs leading-relaxed">
          To change this,{' '}
          <Link to="/console/plans" className={link}>
            publish a new version of a plan
          </Link>
          . Customers stay on their version until you move them.
        </p>
      )}
    </DetailCard>
  )
}
