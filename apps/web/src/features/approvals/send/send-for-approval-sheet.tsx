import { APPROVAL_COPY, APPROVAL_TEXT_MAX } from '@vento/shared'
import { CircleAlertIcon, LoaderCircleIcon, ShieldIcon } from 'lucide-react'
import { type ReactNode, useId, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Sheet } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { SheetFrame } from '@/features/team/sheet-frame'
import { apiErrorMessage, isHandledElsewhere } from '@/lib/api-errors'
import { useOnline } from '@/lib/connection'
import { errorReason } from '@/lib/error-data'
import { hasFinePointer } from '@/lib/pointer'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What would change: "Site engineer: 3 changes", with the changes listed. */
  summary: ReactNode
  /** "Needs approval by Finance, then MD." from `approvals.preview`. */
  chain: string | null
  /** Set when the action would be refused (nobody else can approve a money action). */
  blocked?: string | null
  pending: boolean
  /** The last refusal, shown above the buttons; what was typed stays. */
  error: unknown
  onSend: (reason: string) => void
}

/**
 * Send for approval (spec "On the record"): the change, who approves it, and **Why?** (required,
 * up to 500 characters). Nothing changes until the last approver says yes.
 */
export function SendForApprovalSheet({ open, onOpenChange, ...props }: Props) {
  return (
    <Sheet open={open} onOpenChange={(next) => !props.pending && onOpenChange(next)}>
      {open && <SendBody {...props} onCancel={() => onOpenChange(false)} />}
    </Sheet>
  )
}

function SendBody({
  summary,
  chain,
  blocked = null,
  pending,
  error,
  onSend,
  onCancel,
}: Omit<Props, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const id = useId()
  const online = useOnline()
  const box = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)
  // The server's "Tell the approver why." belongs on the field, not in the banner.
  const reasonError =
    missing || errorReason(error) === 'reason_required' ? APPROVAL_COPY.reasonRequired : null
  const problem =
    error && !isHandledElsewhere(error) && errorReason(error) !== 'reason_required'
      ? apiErrorMessage(error)
      : null

  const send = () => {
    if (pending || blocked) return
    if (!reason.trim()) {
      setMissing(true)
      box.current?.focus()
      return
    }
    onSend(reason.trim())
  }

  return (
    <SheetFrame
      title={APPROVAL_COPY.sendTitle}
      description="Nothing changes until it's approved."
      onOpenAutoFocus={(event) => {
        // The cursor goes in Why? on desktop only; phones keep the keyboard down.
        event.preventDefault()
        if (hasFinePointer()) box.current?.focus()
      }}
      footer={
        <>
          {(problem || blocked) && (
            <Alert variant="destructive" aria-live="polite">
              <CircleAlertIcon aria-hidden />
              <AlertDescription>{blocked ?? problem}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={pending} className="max-md:h-11">
              Cancel
            </Button>
            <Button
              onClick={send}
              disabled={pending || blocked !== null || !online}
              aria-busy={pending || undefined}
              title={online ? undefined : "You're offline. Send when you're back online."}
              className="max-md:h-11 max-md:flex-1"
            >
              {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
              {APPROVAL_COPY.sendTitle}
            </Button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-3 rounded-[10px] border px-3.5 py-3 text-[13px]">
        {summary}
      </div>
      {chain && (
        <p className="flex items-start gap-2 text-[13px]">
          <ShieldIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {chain}
        </p>
      )}
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
        className="flex flex-col gap-1.5"
      >
        <label htmlFor={`${id}-why`} className="font-semibold text-sm">
          Why?
        </label>
        <Textarea
          ref={box}
          id={`${id}-why`}
          name="reason"
          rows={3}
          required
          maxLength={APPROVAL_TEXT_MAX}
          value={reason}
          placeholder={APPROVAL_COPY.whyPlaceholder}
          aria-invalid={reasonError ? true : undefined}
          aria-describedby={reasonError ? `${id}-error` : undefined}
          onChange={(event) => {
            setReason(event.target.value)
            if (event.target.value.trim()) setMissing(false)
          }}
          onKeyDown={(event) => {
            // ⌘↵ sends from the box; a plain Enter is a new line.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send()
          }}
        />
        <FieldError id={`${id}-error`} role="alert">
          {reasonError}
        </FieldError>
      </form>
    </SheetFrame>
  )
}
