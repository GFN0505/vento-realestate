import type { TeamInvitationRow } from '@vento/shared'
import { CircleAlertIcon, CopyIcon, InfoIcon, LoaderCircleIcon, SendIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { SheetFrame } from './sheet-frame'
import { AccessText, InvitationBadge, isUndelivered, PersonAvatar } from './team-cells'
import { useTeamActionsContext } from './use-team-actions'

type Props = Pick<ComponentProps<typeof SheetFrame>, 'onCloseAutoFocus' | 'height'> & {
  row: TeamInvitationRow
}

const DELIVERY: Partial<Record<TeamInvitationRow['delivery'], string>> = {
  bounced: 'The address bounced. Check it and invite again.',
  complained: 'The person marked it as spam.',
  failed: "We couldn't send this email. Try Resend.",
}

/** Invitation sheet (pattern: side sheet with facts and actions): Resend is the main action. */
export function InvitationSheet({ row, ...frame }: Props) {
  const actions = useTeamActionsContext()
  const delivery = isUndelivered(row) ? DELIVERY[row.delivery] : undefined
  const resending = actions.resend.isPending && actions.resend.variables?.id === row.id
  const withdrawing = actions.withdraw.isPending && actions.withdraw.variables?.id === row.id

  return (
    <SheetFrame
      {...frame}
      lead={
        <span className="mb-2">
          <PersonAvatar name={row.email} invited />
        </span>
      }
      title={<span className="break-all">{row.email}</span>}
      description={<InvitationBadge row={row} />}
      footer={
        (row.can.resend || row.can.withdraw) && (
          <div className="flex justify-end gap-2">
            {row.can.withdraw && (
              <Button
                variant="outline"
                disabled={withdrawing}
                onClick={() => actions.withdraw.mutate(row)}
                className="max-md:h-11 max-md:flex-1"
              >
                {withdrawing && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                Withdraw
              </Button>
            )}
            {row.can.resend && (
              <Button
                disabled={resending}
                aria-busy={resending || undefined}
                onClick={() => actions.resend.mutate(row)}
                className="max-md:h-11 max-md:flex-1"
              >
                {resending ? (
                  <LoaderCircleIcon aria-hidden className="animate-spin" />
                ) : (
                  <SendIcon aria-hidden />
                )}
                Resend
              </Button>
            )}
          </div>
        )
      }
    >
      {delivery && (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden />
          <AlertDescription>{delivery}</AlertDescription>
        </Alert>
      )}
      <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-6 gap-y-2.5 text-[13px]">
        <dt className="text-muted-foreground">Role</dt>
        <dd>{row.role.name}</dd>
        <dt className="text-muted-foreground">Entity access</dt>
        <dd>
          <AccessText access={row.access} />
        </dd>
        <dt className="text-muted-foreground">Invited by</dt>
        <dd>{row.invitedByName}</dd>
        <dt className="text-muted-foreground">Sent</dt>
        <dd className="tabular-nums">{formatDate(row.lastSentAt)}</dd>
        <dt className="text-muted-foreground">
          {row.status === 'expired' ? 'Expired' : 'Expires'}
        </dt>
        <dd className="tabular-nums">{formatDate(row.expiresAt)}</dd>
      </dl>
      {row.readOnly ? (
        <p className="flex gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-relaxed">
          <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {row.readOnly.message}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs leading-relaxed">
          To change the role or entity access, withdraw this invitation and invite them again.
        </p>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => actions.copyEmail(row.email)}
        className="-ml-2.5 self-start max-md:h-11"
      >
        <CopyIcon aria-hidden />
        Copy email
      </Button>
    </SheetFrame>
  )
}
