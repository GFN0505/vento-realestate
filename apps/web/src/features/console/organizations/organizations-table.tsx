import { Link, useNavigate } from '@tanstack/react-router'
import type { OrganizationRow } from '@vento/shared/console'
import { ChevronRightIcon } from 'lucide-react'
import { lastActiveLabel } from '@/features/team/last-active'
import { cardRow, nameLink, td, th } from '../ui/back-link'
import { count, GROUP_LABEL, planLabel } from '../words'
import { OverLimitBadge, TrialBadge } from './organization-cells'

type Props = { rows: readonly OrganizationRow[] }

const INTERACTIVE = 'a, button'

/**
 * Board AdminOrgs with the spec's columns (no Projects until the projects module counts them).
 * The row opens the detail page; the name is its keyboard target. Narrow tables put the group under the plan.
 */
export function OrganizationsTable({ rows }: Props) {
  const navigate = useNavigate()
  return (
    <div className="@container overflow-hidden rounded-[10px] border bg-card">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Organizations, most recently active first</caption>
        <colgroup>
          <col className="w-[30%]" />
          <col className="w-[18%]" />
          <col className="hidden @4xl:table-column @4xl:w-[10%]" />
          <col className="w-[9%]" />
          <col className="w-[11%]" />
          <col className="w-[13%]" />
          <col className="w-[19%]" />
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={th}>
              Organization
            </th>
            <th scope="col" className={th}>
              Plan
            </th>
            <th scope="col" className={`${th} hidden @4xl:table-cell`}>
              Group
            </th>
            <th scope="col" className={`${th} text-right`}>
              People
            </th>
            <th scope="col" className={`${th} text-right`}>
              Companies
            </th>
            <th scope="col" className={th}>
              Last active
            </th>
            <th scope="col" className={th}>
              Trial
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="organization-row"
              onClick={(event) => {
                if ((event.target as Element).closest(INTERACTIVE)) return
                void navigate({
                  to: '/console/organizations/$organizationId',
                  params: { organizationId: row.id },
                })
              }}
              className="cursor-pointer transition-colors hover:bg-muted/50"
            >
              <td className={td}>
                <div className="flex min-w-0 flex-col">
                  <Link
                    to="/console/organizations/$organizationId"
                    params={{ organizationId: row.id }}
                    className={nameLink}
                  >
                    {row.name}
                  </Link>
                  <span className="truncate text-muted-foreground text-xs">
                    {row.owner?.name ?? 'No owner'}
                  </span>
                </div>
              </td>
              <td className={td}>
                <div className="flex min-w-0 flex-col items-start gap-1">
                  <span className="max-w-full truncate">{planLabel(row.plan)}</span>
                  <span className="text-muted-foreground text-xs @4xl:hidden">
                    {GROUP_LABEL[row.releaseGroup]} group
                  </span>
                  <OverLimitBadge over={row.overLimit} />
                </div>
              </td>
              <td className={`${td} hidden text-muted-foreground @4xl:table-cell`}>
                {GROUP_LABEL[row.releaseGroup]}
              </td>
              <td className={`${td} text-right tabular-nums`}>{count(row.people)}</td>
              <td className={`${td} text-right tabular-nums`}>{count(row.companies)}</td>
              <td className={`${td} text-muted-foreground tabular-nums`}>
                {lastActiveLabel(row.lastActiveAt)}
              </td>
              <td className={td}>
                <TrialBadge trial={row.trial} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Phones: name, plan, trial badge and last active (spec "Below md: cards"). */
export function OrganizationsCards({ rows }: Props) {
  return (
    <ul aria-label="Organizations" className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            to="/console/organizations/$organizationId"
            params={{ organizationId: row.id }}
            className={cardRow}
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-semibold text-[14px]">{row.name}</span>
              <ChevronRightIcon
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
            </span>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs tabular-nums">
                {planLabel(row.plan)} · {GROUP_LABEL[row.releaseGroup]} ·{' '}
                {lastActiveLabel(row.lastActiveAt)}
              </span>
              <span className="flex gap-1.5">
                <OverLimitBadge over={row.overLimit} />
                <TrialBadge trial={row.trial} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
