import { APPROVAL_COPY, type ApprovalRequestDetail } from '@vento/shared'
import { InfoIcon, LoaderCircleIcon, ShieldIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Avatar } from '@/components/avatar'
import { HrefLink } from '@/components/href-link'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { useOnline } from '@/lib/connection'
import { ageText, amountText, requestState } from './approval-words'
import { ChangesTable } from './changes-table'
import { DecisionForm } from './decision-form'
import { StepsChain } from './steps-chain'
import { useCancelRequest } from './use-cancel-request'

type Props = {
  detail: ApprovalRequestDetail
  /** After a decision: the next request, or back to the list on phones. */
  onDecided: () => void
  /** Phones: a full page whose buttons sit above the tabs. */
  page?: boolean
}

/**
 * The request (board Approvals, right pane; ApprovalsMobile as a page): title, record link and
 * amount, Field · Before · After, who asked and why, the policy, the steps, then what the viewer
 * can do: decide, cancel their own, or read why not.
 */
export function ApprovalDetail({ detail, onDecided, page = false }: Props) {
  const amount = detail.amount ? amountText(detail.amount) : null
  const pending = detail.status === 'pending'
  const state = requestState(detail)
  return (
    <article aria-labelledby="approval-title" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="approval-title" className="font-heading font-semibold text-[17px] leading-snug">
            {detail.summary.title}
          </h2>
          <RecordLink detail={detail} />
          {!pending && (
            <StatusBadge tone={state.tone} className="mt-1 w-fit max-w-full">
              <span className="truncate">{state.label}</span>
            </StatusBadge>
          )}
        </div>
        {amount && (
          <div className="flex flex-col items-end">
            <span className="font-semibold text-xl tabular-nums">{amount.main}</span>
            {amount.ngn && (
              <span className="text-muted-foreground text-xs tabular-nums">{amount.ngn}</span>
            )}
          </div>
        )}
      </header>
      <ChangesTable changes={detail.summary.changes} />
      <div className="flex items-start gap-3 rounded-[10px] bg-muted/40 px-3.5 py-3">
        <Avatar
          name={detail.makerName}
          className="size-7 border bg-card text-[10px] text-foreground"
        />
        <p className="min-w-0 wrap-anywhere text-[13px] leading-relaxed">
          <span className="font-semibold">{detail.makerName}</span>{' '}
          <span className="text-muted-foreground">asked {ageText(detail.createdAt)}</span>
          <br />“{detail.reason}”
        </p>
      </div>
      <p className="flex items-start gap-2 text-muted-foreground text-xs leading-relaxed">
        <ShieldIcon aria-hidden className="mt-px size-3.5 shrink-0" />
        {detail.policy}
      </p>
      <StepsChain makerName={detail.makerName} createdAt={detail.createdAt} steps={detail.steps} />
      {detail.endedNote && <Note>{detail.endedNote}</Note>}
      {pending && <Actions detail={detail} onDecided={onDecided} page={page} />}
    </article>
  )
}

function Actions({ detail, onDecided, page }: Required<Props>) {
  // A cancelled request stays open: it now reads "Cancelled" in My requests.
  if (detail.isOwn) return <OwnRequestNote detail={detail} />
  if (detail.canDecide) return <DecisionForm detail={detail} onDone={onDecided} sticky={page} />
  if (detail.blockedReason) return <Note>{detail.blockedReason}</Note>
  return null
}

function RecordLink({ detail }: { detail: ApprovalRequestDetail }) {
  const { recordLink, recordLabel } = detail.summary
  const entity = detail.entity ? ` · ${detail.entity.name}` : ''
  if (!recordLink) {
    return <span className="text-muted-foreground text-xs">{`${recordLabel}${entity}`}</span>
  }
  return (
    <span className="text-xs">
      <HrefLink
        href={recordLink}
        className="rounded-sm font-medium text-link underline-offset-4 outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:inline-block max-md:py-2"
      >
        {recordLabel} →
      </HrefLink>
      <span className="text-muted-foreground">{entity}</span>
    </span>
  )
}

/**
 * "This is your own request. Aisha Bello (Finance) will review it. You can cancel it while it
 * waits." and **Cancel my request**, instead of the buttons (spec).
 */
export function OwnRequestNote({
  detail,
}: {
  detail: Pick<ApprovalRequestDetail, 'id' | 'reviewerHint' | 'canCancel'>
}) {
  const online = useOnline()
  const cancel = useCancelRequest()
  return (
    <div className="flex flex-col gap-3">
      <p
        role="note"
        className="rounded-[10px] border border-status-blue-border bg-status-blue-bg px-3.5 py-3 text-[13px] leading-relaxed"
      >
        <span className="font-semibold text-status-blue-fg">This is your own request.</span>{' '}
        {detail.reviewerHint ? `${detail.reviewerHint} ` : ''}
        {detail.canCancel && 'You can cancel it while it waits.'}
      </p>
      {detail.canCancel && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => cancel.mutate(detail.id)}
            disabled={cancel.isPending || !online}
            aria-busy={cancel.isPending || undefined}
            title={online ? undefined : APPROVAL_COPY.offline}
            className="max-md:h-11 max-md:w-full"
          >
            {cancel.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            Cancel my request
          </Button>
        </div>
      )}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2.5 rounded-[10px] border bg-muted/40 px-3.5 py-3 text-[13px] leading-relaxed">
      <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 wrap-anywhere">{children}</span>
    </p>
  )
}
