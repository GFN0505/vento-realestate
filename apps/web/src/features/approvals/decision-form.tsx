import { APPROVAL_COPY, APPROVAL_TEXT_MAX, type ApprovalRequestDetail } from '@vento/shared'
import { LoaderCircleIcon, WifiOffIcon } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { PAGE_SHORTCUT_EVENT } from '@/features/shell/shortcuts'
import { useOnline } from '@/lib/connection'
import { cn } from '@/lib/utils'
import { amountText, commentPlaceholder } from './approval-words'
import { useDecide } from './use-decide'

type Props = {
  detail: ApprovalRequestDetail
  /** Opens the next request (or goes back to the list on phones). */
  onDone: () => void
  /** Phones: the buttons sit in a bar above the tabs (spec). */
  sticky?: boolean
}

/**
 * Comment (required to reject), **Reject** and the primary that names the effect ("Approve role
 * change"). No second confirm, except actions the catalog marks irreversible, which ask once
 * with the amount. `A` approves and `R` goes to the comment (listed under `?`).
 */
export function DecisionForm({ detail, onDone, sticky = false }: Props) {
  const id = useId()
  const online = useOnline()
  const decide = useDecide(onDone, { title: detail.summary.title, makerName: detail.makerName })
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const box = useRef<HTMLTextAreaElement>(null)
  const pending = decide.isPending
  const disabled = pending || !online
  const trimmed = comment.trim()
  // The step on screen: if someone decided it meanwhile, the server says so instead of deciding
  // the next one.
  const base = { requestId: detail.id, step: detail.currentStep }

  const approve = () => {
    if (disabled) return
    setError(null)
    if (detail.irreversible) return setConfirming(true)
    decide.mutate({ ...base, decision: 'approve', comment: trimmed || undefined })
  }
  const reject = () => {
    if (disabled) return
    if (!trimmed) {
      setError(APPROVAL_COPY.commentRequired)
      box.current?.focus()
      return
    }
    decide.mutate({ ...base, decision: 'reject', comment: trimmed })
  }

  const latest = useRef({ approve, focus: () => box.current?.focus() })
  latest.current = { approve, focus: () => box.current?.focus() }
  useEffect(() => {
    function onShortcut(event: Event) {
      const shortcut = (event as CustomEvent<string>).detail
      if (shortcut === 'approvals-approve') latest.current.approve()
      if (shortcut === 'approvals-comment') latest.current.focus()
    }
    window.addEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
    return () => window.removeEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
  }, [])

  const amount = detail.amount ? amountText(detail.amount).main : null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-comment`} className="font-semibold text-muted-foreground text-xs">
          Comment <span className="font-normal">(required to reject)</span>
        </label>
        <Textarea
          ref={box}
          id={`${id}-comment`}
          name="comment"
          rows={2}
          value={comment}
          maxLength={APPROVAL_TEXT_MAX}
          placeholder={commentPlaceholder(detail.makerName)}
          aria-keyshortcuts="r"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setComment(event.target.value)
            if (error && event.target.value.trim()) setError(null)
          }}
        />
        {/* Room kept for the error, so the buttons never jump when it shows. */}
        <div className="min-h-5">
          <FieldError id={`${id}-error`} role="alert">
            {error}
          </FieldError>
        </div>
      </div>
      <div
        className={cn(
          // Always in reach: above the tabs on phones, at the foot of the pane on larger screens.
          'z-30 flex flex-col gap-2 border-t bg-card',
          sticky
            ? 'fixed inset-x-0 bottom-(--tabbar-height) px-4 py-3'
            : 'sticky bottom-0 -mx-5 -mb-5 rounded-b-lg px-5 py-3 lg:-mx-6 lg:px-6',
        )}
      >
        {!online && (
          <p id={`${id}-offline`} className="flex items-center gap-2 text-muted-foreground text-xs">
            <WifiOffIcon aria-hidden className="size-3.5" />
            {APPROVAL_COPY.offline}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={reject}
            disabled={disabled}
            aria-describedby={online ? undefined : `${id}-offline`}
            className="border-status-rose-border text-status-rose-fg hover:bg-status-rose-bg hover:text-status-rose-fg max-md:h-11 max-md:flex-1"
          >
            {pending && decide.variables?.decision === 'reject' && (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            )}
            Reject
          </Button>
          <Button
            onClick={approve}
            disabled={disabled}
            aria-busy={pending || undefined}
            aria-keyshortcuts="a"
            aria-describedby={online ? undefined : `${id}-offline`}
            className="max-md:h-11 max-md:flex-1"
          >
            {pending && decide.variables?.decision === 'approve' && (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            )}
            {detail.approveLabel}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`${detail.approveLabel}?`}
        confirmLabel={detail.approveLabel}
        pending={pending}
        onConfirm={() => {
          setConfirming(false)
          decide.mutate({ ...base, decision: 'approve', comment: trimmed || undefined })
        }}
      >
        {amount ? `${detail.summary.title} · ${amount}. ` : `${detail.summary.title}. `}
        This can't be undone once it's approved.
      </ConfirmDialog>
    </div>
  )
}
