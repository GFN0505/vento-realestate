import { Link } from '@tanstack/react-router'
import { featureLabel } from '@vento/shared'
import type { Dashboard } from '@vento/shared/console'
import { ActivityItem } from '../activity/activity-item'
import { CardNote, DetailCard } from '../ui/detail-card'
import { count, plural } from '../words'
import { versionsWords } from './dashboard-words'

const link =
  'rounded-sm font-semibold text-link outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring'

function Bar({ share, tone = 'brand' }: { share: number; tone?: 'brand' | 'amber' | 'slate' }) {
  const fill = { brand: 'bg-brand', amber: 'bg-status-amber', slate: 'bg-status-slate' }[tone]
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span
        className={`block h-full rounded-full ${fill}`}
        style={{ width: `${Math.round(share * 100)}%` }}
      />
    </span>
  )
}

/** Panel 2 (spec §2): organizations by plan, features at pilot, the latest platform changes. */
export function PlansReleasesPanel({ plans }: { plans: Dashboard['plans'] }) {
  const total = plans.byPlan.reduce((sum, p) => sum + p.total, 0) + plans.internal + plans.noPlan
  const share = (n: number) => (total > 0 ? n / total : 0)
  return (
    <DetailCard title="Plans and releases">
      <section aria-label="Organizations by plan" className="flex flex-col gap-3 pb-3">
        <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
          Organizations by plan
        </h3>
        <ul className="flex flex-col gap-3">
          {plans.byPlan.map((plan) => (
            <li key={plan.key} className="flex flex-col gap-1 text-[13px]">
              <span className="flex items-baseline justify-between gap-3">
                <Link to="/console/plans/$planKey" params={{ planKey: plan.key }} className={link}>
                  {plan.name}
                </Link>
                <span className="tabular-nums">{count(plan.total)}</span>
              </span>
              <Bar share={share(plan.total)} />
              {plan.versions.length > 0 && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  {versionsWords(plan.versions)}
                </span>
              )}
            </li>
          ))}
          <li className="flex flex-col gap-1 text-[13px]">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">Internal</span>
              <span className="tabular-nums">{count(plans.internal)}</span>
            </span>
            <Bar share={share(plans.internal)} tone="slate" />
          </li>
          <li className="flex flex-col gap-1 text-[13px]">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-status-amber-fg">No plan</span>
              <span className="tabular-nums">{count(plans.noPlan)}</span>
            </span>
            <Bar share={share(plans.noPlan)} tone="amber" />
          </li>
        </ul>
      </section>
      <section aria-label="At pilot" className="border-t py-3 text-[13px]">
        <h3 className="pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
          At pilot
        </h3>
        {plans.atPilot.length === 0 ? (
          <span className="text-muted-foreground">No features at pilot.</span>
        ) : (
          <p>
            {plural(plans.atPilot.length, 'feature')}:{' '}
            {plans.atPilot.map((key, i) => (
              <span key={key}>
                {i > 0 && ', '}
                <Link to="/console/releases/$key" params={{ key }} className={link}>
                  {featureLabel(key)}
                </Link>
              </span>
            ))}
          </p>
        )}
      </section>
      <section aria-label="Recent changes" className="border-t pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
            Recent changes
          </h3>
          <Link
            to="/console/activity"
            className={`${link} text-xs max-md:inline-flex max-md:min-h-11 max-md:items-center`}
          >
            See all activity
          </Link>
        </div>
        {plans.recent.length === 0 ? (
          <CardNote>No changes yet.</CardNote>
        ) : (
          <ul>
            {plans.recent.map((row) => (
              <ActivityItem key={row.id} row={row} showOrganization />
            ))}
          </ul>
        )}
      </section>
    </DetailCard>
  )
}
