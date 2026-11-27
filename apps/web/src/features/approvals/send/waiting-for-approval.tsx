import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { APPROVAL_COPY } from '@vento/shared'
import { Clock3Icon, LoaderCircleIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnline } from '@/lib/connection'
import { cn } from '@/lib/utils'
import { ageText } from '../approval-words'
import { approvalDetailQuery } from '../approvals-queries'
import { useCancelRequest } from '../use-cancel-request'

type Props = {
  requestId: string
  /**
   * Who approves, from the preview, for people who can't open the request itself ("Owner or
   * Admin"). The request's own `waitingFor` wins when it loads.
   */
  fallback: string | null
  className?: string
}

/** "Waiting for approval by Finance" without the doubled "by by" when the text already has it. */
export function waitingLine(waitingFor: string | null): string {
  return waitingFor ? `Waiting for approval by ${waitingFor}` : 'Waiting for approval'
}

/**
 * The record's status while a request waits (board Approvals, "What the requester sees on the
 * record"): it replaces the action, so nobody thinks the change already happened. The maker can
 * **Cancel request**.
 */
export function WaitingForApproval({ requestId, fallback, className }: Props) {
  const online = useOnline()
  const query = useQuery(approvalDetailQuery(requestId))
  const cancel = useCancelRequest()
  const detail = query.data
  const waitingFor = detail?.waitingFor ?? fallback
  return (
    <section
      aria-label="Approval"
      className={cn('flex flex-col gap-3 rounded-[12px] border bg-card p-3.5 sm:p-4', className)}
    >
      <div
        role="status"
        className="flex items-start gap-2.5 rounded-lg border border-status-amber-border bg-status-amber-bg px-3 py-2.5"
      >
        <Clock3Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-status-amber-fg" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug">
          <span className="font-semibold text-status-amber-fg">{waitingLine(waitingFor)}</span>
          <br />
          <span className="text-muted-foreground text-xs">
            {query.isPending ? (
              <Skeleton aria-hidden className="inline-block h-3 w-48 align-middle" />
            ) : (
              `${detail ? `Requested ${ageText(detail.createdAt)} · ` : ''}nothing changes until it's approved`
            )}
          </span>
        </p>
      </div>
      {detail && (
        <div className="flex flex-wrap items-center gap-2">
          {detail.canCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => cancel.mutate(requestId)}
              disabled={cancel.isPending || !online}
              aria-busy={cancel.isPending || undefined}
              title={online ? undefined : APPROVAL_COPY.offline}
              className="max-md:h-11"
            >
              {cancel.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
              Cancel request
            </Button>
          )}
          <Link
            to="/approvals"
            search={{ tab: detail.isOwn ? 'mine' : undefined, id: requestId }}
            className="rounded-sm px-1 font-semibold text-link text-xs underline-offset-4 outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:py-3"
          >
            See the request
          </Link>
        </div>
      )}
    </section>
  )
}
