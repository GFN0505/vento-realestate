import { Link } from '@tanstack/react-router'
import type { TeamMemberRow } from '@vento/shared'
import { HistoryIcon } from 'lucide-react'
import { WaitingForApproval } from '@/features/approvals/send/waiting-for-approval'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { canSeeAuditLog } from '@/features/settings/sections'

/**
 * "Waiting for approval by Owner" while a request to make this member an owner waits (brick 4),
 * so nobody thinks it already happened. The row carries it as `pendingApproval`.
 */
export function MemberOwnerRequest({ row }: { row: TeamMemberRow }) {
  if (!row.pendingApproval) return null
  return <WaitingForApproval pending={row.pendingApproval} />
}

/** **View history**: the audit log filtered to this member (owners and admins with every company). */
export function MemberHistoryLink({ row }: { row: TeamMemberRow }) {
  const access = useEffectiveAccess()
  if (!canSeeAuditLog(access)) return null
  return (
    <Link
      to="/settings/audit-log"
      search={{ target: 'member', targetId: row.id, about: row.name }}
      className="-ml-2.5 inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 font-semibold text-xs outline-hidden transition-colors hover:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:h-11 [&_svg]:size-4"
    >
      <HistoryIcon aria-hidden />
      View history
    </Link>
  )
}
