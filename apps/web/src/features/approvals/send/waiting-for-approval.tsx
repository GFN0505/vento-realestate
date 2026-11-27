import { Link } from '@tanstack/react-router'
import { APPROVAL_COPY, type PendingApproval } from '@vento/shared'
import { Clock3Icon, LoaderCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOnline } from '@/lib/connection'
import { cn } from '@/lib/utils'
import { ageText } from '../approval-words'
import { useCancelRequest } from '../use-cancel-request'

/** "Waiting for approval by Owner or Admin". */
export function waitingLine(waitingFor: string): string {
  return `Waiting for approval by ${waitingFor}`
}

/**
 * The record's status while a request waits (board Approvals, "What the requester sees on the
 * record"): it replaces the action, so nobody thinks the change already happened. The maker can
 * **Cancel request**. The record carries `pendingApproval`, so this needs no request of its own.
 */
export function WaitingForApproval({
  pending,
  className,
}: {
  pending: PendingApproval
  className?: string
}) {
  const online = useOnline()
  const cancel = useCancelRequest()
  return (
    <section
      aria-label="Approval"
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[12px] border border-status-amber-border bg-status-amber-bg px-3.5 py-3',
        className,
      )}
    >
      <div role="status" className="flex min-w-0 flex-1 items-start gap-2.5">
        <Clock3Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-status-amber-fg" />
        <p className="min-w-0 text-[13px] leading-snug">
          <span className="font-semibold text-status-amber-fg">
            {waitingLine(pending.waitingFor)}
          </span>
          <br />
          <span className="text-muted-foreground text-xs">
            Requested {ageText(pending.requestedAt)} · nothing changes until it's approved
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/approvals"
          search={{ tab: pending.isOwn ? 'mine' : undefined, id: pending.requestId }}
          className="rounded-sm px-1 font-semibold text-link text-xs underline-offset-4 outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:py-3"
        >
          See the request
        </Link>
        {pending.isOwn && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => cancel.mutate(pending.requestId)}
            disabled={cancel.isPending || !online}
            aria-busy={cancel.isPending || undefined}
            title={online ? undefined : APPROVAL_COPY.offline}
            className="max-md:h-11"
          >
            {cancel.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            Cancel request
          </Button>
        )}
      </div>
    </section>
  )
}
