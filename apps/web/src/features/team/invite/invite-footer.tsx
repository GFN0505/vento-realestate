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
  count: number
  error: unknown
  /** Rows marked with a problem after a send attempt. */
  problems: number
  placesMessage: string | null
  pending: boolean
  onSend: () => void
  onCancel: () => void
}

/** "Send invitation" / "Send 5 invitations". */
export function sendLabel(count: number): string {
  return count > 1 ? `Send ${count} invitations` : 'Send invitation'
}

function errorText(error: unknown): string | null {
  if (!error || isPlanLimit(error)) return null
  // The session-expired dialog and the tab-switch reload speak for themselves.
  if (error instanceof ORPCError && error.code === 'UNAUTHORIZED') return null
  if (errorReason(error) === 'organization_changed') return null
  // Clashes are marked on their rows (spec: on the row, never in a banner).
  if (errorReason(error) === 'already_member' || errorReason(error) === 'already_invited') {
    return null
  }
  if (errorReason(error) === 'entity_unavailable') return ENTITY_UNAVAILABLE
  if (error instanceof ORPCError && error.code === 'NOT_FOUND') return ENTITY_UNAVAILABLE
  return apiErrorMessage(error)
}

/** Sticky footer: what's stopping the send (if anything), then Cancel and Send. */
export function InviteFooter({
  count,
  error,
  problems,
  placesMessage,
  pending,
  ...actions
}: Props) {
  const text = errorText(error)
  return (
    <>
      <div aria-live="polite" className="flex flex-col gap-2 empty:hidden">
        {placesMessage && (
          <Alert variant="info">
            <CircleFadingArrowUpIcon aria-hidden />
            <AlertDescription className="gap-2.5">
              <p className="text-pretty">{placesMessage}</p>
              <TalkToVentoButton about="more people" />
            </AlertDescription>
          </Alert>
        )}
        <PlanLimitMessage error={error} />
        {text && (
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden />
            <AlertDescription>{text}</AlertDescription>
          </Alert>
        )}
        {!text && problems > 0 && (
          <p className="text-status-rose-fg text-xs">
            {problems === 1 ? '1 email needs a look' : `${problems} emails need a look`} before
            sending.
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={actions.onCancel} className="max-md:h-11">
          Cancel
        </Button>
        <Button
          type="button"
          onClick={actions.onSend}
          disabled={pending || placesMessage !== null}
          aria-busy={pending || undefined}
          className="min-w-36 max-md:h-11 max-md:flex-1"
        >
          {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          {sendLabel(count)}
        </Button>
      </div>
    </>
  )
}
