import { useQuery } from '@tanstack/react-query'
import type { StaffInvitationRow } from '@vento/shared/console'
import { useEffect, useState } from 'react'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { DetailCard } from '../ui/detail-card'
import { formatDateTime, invitationsQuery } from './queries'
import { useResendInvitation } from './use-resend-invitation'

/** Re-renders when the earliest "resend allowed" moment passes, so the button wakes up. */
function useNow(rows: readonly StaffInvitationRow[]): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const next = rows
      .map((r) => Date.parse(r.resendableAt))
      .filter((t) => t > now)
      .sort((a, b) => a - b)[0]
    if (next === undefined) return
    const timer = window.setTimeout(() => setNow(Date.now()), next - now + 50)
    return () => window.clearTimeout(timer)
  }, [rows, now])
  return now
}

/** Invitations (spec 1b): hidden when there are none. Resend once a minute, or withdraw. */
export function InvitationsSection({ onWithdraw }: { onWithdraw: (id: string) => void }) {
  const invitations = useQuery(invitationsQuery())
  const rows = invitations.data ?? []
  const now = useNow(rows)
  const resend = useResendInvitation()
  if (rows.length === 0) return null
  return (
    <DetailCard title="Invitations" flush>
      <ul aria-label="Invitations">
        {rows.map((row) => {
          const waiting = Date.parse(row.resendableAt) > now
          const sending = resend.isPending && resend.variables === row.id
          return (
            <li
              key={row.id}
              data-testid="staff-invitation-row"
              className="flex flex-col gap-3 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:px-[18px]"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-semibold text-[13.5px]">{row.name}</span>
                <span className="truncate text-muted-foreground text-xs">{row.email}</span>
                <span className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs tabular-nums">
                  Invited by {row.invitedByName ?? 'Vento Real Estate (setup)'} ·{' '}
                  {row.status === 'expired' ? (
                    <StatusBadge tone="rose">Expired</StatusBadge>
                  ) : (
                    `Expires ${formatDateTime(row.expiresAt)}`
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={waiting || sending}
                  aria-busy={sending || undefined}
                  title={waiting ? 'You can resend a minute after the last email.' : undefined}
                  onClick={() => resend.mutate(row.id)}
                  className="max-md:h-11 max-md:flex-1"
                >
                  Resend<span className="sr-only"> {row.name}'s invitation</span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onWithdraw(row.id)}
                  className="max-md:h-11 max-md:flex-1"
                >
                  Withdraw<span className="sr-only"> {row.name}'s invitation</span>
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </DetailCard>
  )
}
