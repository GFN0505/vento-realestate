import { ORPCError } from '@orpc/client'
import { CircleAlertIcon, CircleFadingArrowUpIcon, LoaderCircleIcon } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { PlanLimitMessage } from '@/features/plan/plan-limit-message'
import { TalkToVentoButton } from '@/features/plan/talk-to-vento-button'
import { apiErrorMessage } from '@/lib/api-errors'
import { errorReason, isPlanLimit } from '@/lib/error-data'
import { ENTITY_UNAVAILABLE } from './use-send-invitations'

type Props = {
  /** Rows that will go (marked rows are skipped). */
  count: number
  /** Rows in the list, including marked ones. */
  total: number
  error: unknown
  /** Marked rows (bad address, already in, "That's you"). */
  problems: number
  /** Owners over the plan's places: the reason Send is off. */
  placesMessage: string | null
  /** Places left, for "Send only 1"; null or 0 hides it. */
  left: number | null
  pending: boolean
  onSend: () => void
  onSendOnly: () => void
  onCancel: () => void
}

export const SEND_REASON_ID = 'invite-send-reason'

/** "Send invitation" / "Send 5 invitations". */
export function sendLabel(count: number): string {
  return count > 1 ? `Send ${count} invitations` : 'Send invitation'
}

function errorText(error: unknown): string | null {
  if (!error || isPlanLimit(error)) return null
  // The session-expired dialog and the tab-switch reload speak for themselves.
  if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') return null
  const reason = errorReason(error)
  if (reason === 'organization_changed') return null
  // Clashes are marked on their rows (spec: on the row, never in a banner).
  if (reason === 'already_member' || reason === 'already_invited') return null
  if (reason === 'entity_unavailable') return ENTITY_UNAVAILABLE
  // "Tell the approver why." sits on the Why? field.
  if (reason === 'reason_required') return null
  if (error instanceof ORPCError && error.code === 'NOT_FOUND') return ENTITY_UNAVAILABLE
  return apiErrorMessage(error)
}

/**
 * Sticky footer. Whatever stops Send sits directly above it and is linked to it, so a disabled
 * button always says why; marked rows never stop the others going.
 */
export function InviteFooter({
  count,
  total,
  error,
  problems,
  placesMessage,
  left,
  pending,
  ...actions
}: Props) {
  const text = errorText(error)
  const allMarked = total > 0 && count === 0
  const blocked = placesMessage !== null || allMarked
  return (
    <>
      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        <PlanLimitMessage error={error} />
        {text && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden />
            <AlertDescription>{text}</AlertDescription>
          </Alert>
        )}
        {placesMessage ? (
          <Alert id={SEND_REASON_ID} variant="info">
            <CircleFadingArrowUpIcon aria-hidden />
            <AlertDescription className="gap-2.5">
              <p className="text-pretty">{placesMessage}</p>
              <span className="flex flex-wrap gap-2">
                <TalkToVentoButton about="more people" />
                {left !== null && left > 0 && (
                  <Button variant="ghost" size="sm" onClick={actions.onSendOnly}>
                    Send only {left}
                  </Button>
                )}
              </span>
            </AlertDescription>
          </Alert>
        ) : allMarked ? (
          <p id={SEND_REASON_ID} className="text-status-rose-fg text-xs">
            Fix or remove the marked {problems === 1 ? 'email' : 'emails'} to send.
          </p>
        ) : (
          problems > 0 && (
            <p className="text-muted-foreground text-xs">
              {problems === 1 ? '1 marked email' : `${problems} marked emails`} won't be sent.
            </p>
          )
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={actions.onCancel} className="max-md:h-11">
          Cancel
        </Button>
        <Button
          type="button"
          onClick={actions.onSend}
          disabled={pending || blocked}
          aria-busy={pending || undefined}
          aria-describedby={blocked ? SEND_REASON_ID : undefined}
          className="min-w-36 max-md:h-11 max-md:flex-1"
        >
          {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          {sendLabel(count)}
        </Button>
      </div>
    </>
  )
}
