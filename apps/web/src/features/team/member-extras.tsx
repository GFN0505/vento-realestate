import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { TeamMemberRow } from '@vento/shared'
import { HistoryIcon } from 'lucide-react'
import { approvalPreviewQuery } from '@/features/approvals/send/approval-preview'
import { WaitingForApproval } from '@/features/approvals/send/waiting-for-approval'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { canSeeAuditLog } from '@/features/settings/sections'

/**
 * "Waiting for approval by Owner" while a request to make this member an owner waits (brick 4),
 * so nobody thinks it already happened.
 */
// TODO(contract): `teamMemberRow` has no `pendingApproval`, so the row can't read "Owner ·
// waiting for approval" and this asks `approvals.preview` per open sheet instead.
export function MemberOwnerRequest({ row }: { row: TeamMemberRow }) {
  const asks = row.role.key !== 'owner' && row.can.changeAccess
  const preview = useQuery({
    ...approvalPreviewQuery('access.member.make_owner', { type: 'member', id: row.id }),
    enabled: asks,
  })
  const pending = preview.data?.needed ? preview.data : null
  if (!asks || !pending?.pendingRequestId) return null
  return <WaitingForApproval requestId={pending.pendingRequestId} fallback={pending.chain} />
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
