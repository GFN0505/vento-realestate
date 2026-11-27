import { Link } from '@tanstack/react-router'
import type { ReleaseDetail } from '@vento/shared/console'
import { ActivityItem } from '../activity/activity-item'
import { overrideUntil } from '../organizations/override-words'
import { CardNote, DetailCard } from '../ui/detail-card'
import { count, GROUP_LABEL } from '../words'

const GROUP_ORDER = ['internal', 'pilot', 'standard'] as const

/** Organizations that have it, by release group; the first 50 names, the count is all. */
export function Holders({ release }: { release: ReleaseDetail }) {
  const groups = GROUP_ORDER.map((g) => release.holders.find((h) => h.group === g)).filter(
    (h) => h !== undefined,
  )
  const total = groups.reduce((sum, h) => sum + h.count, 0)
  return (
    <DetailCard title={`Organizations that have it · ${count(total)}`}>
      {total === 0 ? (
        <CardNote>No organization has it at this stage.</CardNote>
      ) : (
        groups
          .filter((h) => h.count > 0)
          .map((h) => (
            <section key={h.group} className="border-t py-2.5 first:border-t-0">
              <h3 className="font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
                {GROUP_LABEL[h.group]} · {count(h.count)}
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed">
                {h.organizations.map((o, i) => (
                  <span key={o.id}>
                    {i > 0 && ', '}
                    <Link
                      to="/console/organizations/$organizationId"
                      params={{ organizationId: o.id }}
                      className="rounded-sm font-medium text-link outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {o.name}
                    </Link>
                  </span>
                ))}
                {h.count > h.organizations.length && (
                  <span className="text-muted-foreground">
                    {' '}
                    and {count(h.count - h.organizations.length)} more
                  </span>
                )}
              </p>
            </section>
          ))
      )}
    </DetailCard>
  )
}

/** Live overrides on this feature, each naming its organization. */
export function ReleaseOverrides({ release }: { release: ReleaseDetail }) {
  return (
    <DetailCard title="Overrides">
      {release.overrides.length === 0 ? (
        <CardNote>No organization has an override on this feature.</CardNote>
      ) : (
        <ul>
          {release.overrides.map((o) => (
            <li key={o.id} className="border-t py-2.5 text-[13px] first:border-t-0">
              <Link
                to="/console/organizations/$organizationId"
                params={{ organizationId: o.organization.id }}
                className="rounded-sm font-semibold text-link outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
              >
                {o.organization.name}
              </Link>
              <span>
                {' '}
                · {o.kind === 'release' ? 'Release' : 'Plan'} · {o.enabled ? 'on' : 'off'}
              </span>
              <p className="text-muted-foreground text-xs">
                {overrideUntil(o)} · “{o.reason}”
              </p>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  )
}

export function RecentChanges({ release }: { release: ReleaseDetail }) {
  return (
    <DetailCard title="Recent changes">
      {release.recentChanges.length === 0 ? (
        <CardNote>No changes yet.</CardNote>
      ) : (
        <ul>
          {release.recentChanges.map((row) => (
            <ActivityItem key={row.id} row={row} showOrganization />
          ))}
        </ul>
      )}
    </DetailCard>
  )
}
