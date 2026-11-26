import { LoaderCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { hasFinePointer } from '@/lib/pointer'
import type { ChangeNext } from './change-errors'
import { PreviewLines } from './preview-lines'
import { ReasonField } from './reason-field'
import { type ChangeController, reasonProblem } from './use-change'

const NEXT_LABEL: Record<ChangeNext, string> = {
  end_trial: 'End trial',
  change_ai_budget: 'Change AI budget',
}

type BodyProps = {
  change: ChangeController
  formId: string
  fields?: ReactNode
  onReview?: () => void
  onNext?: (next: ChangeNext) => void
}

/** The step's content: the fields, or the preview lines and the reason (plan §9.4). */
export function ChangeBody({ change, formId, fields, onReview, onNext }: BodyProps) {
  const failure = change.failure && !change.failure.silent ? change.failure : null
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {change.pending === 'preview' ? 'Checking what this change does…' : ''}
        {change.pending === 'apply' ? 'Making the change…' : ''}
      </p>
      {failure && (
        <FormAlert
          variant="error"
          action={
            failure.next && onNext ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => onNext(failure.next as ChangeNext)}
              >
                {NEXT_LABEL[failure.next]}
              </Button>
            ) : undefined
          }
        >
          {failure.message}
        </FormAlert>
      )}
      {change.step === 'fields' && fields ? (
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            onReview?.()
          }}
          className="flex flex-col gap-5"
        >
          {fields}
        </form>
      ) : change.step === 'fields' ? (
        change.pending === 'preview' ? (
          <div aria-hidden className="flex flex-col gap-2">
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : null
      ) : (
        <form
          id={formId}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void change.apply()
          }}
          onKeyDown={(event) => {
            // ⌘Enter / Ctrl+Enter confirms from the reason box; Enter alone is a new line.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void change.apply()
          }}
          className="flex flex-col gap-5"
        >
          <PreviewLines lines={change.lines} />
          <ReasonField
            value={change.reason}
            onChange={change.setReason}
            onBlur={change.blurReason}
            error={change.reasonError}
            disabled={change.pending === 'apply'}
            autoFocus={hasFinePointer()}
          />
        </form>
      )}
    </>
  )
}

type FooterProps = {
  change: ChangeController
  formId: string
  hasFields: boolean
  confirmLabel: string
  destructive?: boolean
  onCancel: () => void
}

/** Cancel + Review on the fields; Back + the button naming the change on review. */
export function ChangeFooter({
  change,
  formId,
  hasFields,
  confirmLabel,
  destructive,
  onCancel,
}: FooterProps) {
  const review = change.step === 'review'
  const busy = change.pending !== null
  // Nothing to confirm (no fields, and the preview was refused): the only way on is Close.
  const nothingToDo = !review && !hasFields && !busy
  const needsReason = review && !busy && reasonProblem(change.reason) !== null
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end [&>button]:max-sm:h-11">
      {needsReason && (
        <p className="text-muted-foreground text-xs max-sm:text-center sm:mr-auto">
          Add a reason to continue.
        </p>
      )}
      {review && hasFields ? (
        <Button type="button" variant="ghost" disabled={busy} onClick={change.back}>
          Back
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          disabled={change.pending === 'apply'}
          onClick={onCancel}
        >
          {nothingToDo ? 'Close' : 'Cancel'}
        </Button>
      )}
      {review ? (
        <Button
          type="submit"
          form={formId}
          variant={destructive ? 'destructive' : 'default'}
          disabled={!change.canApply}
          aria-busy={change.pending === 'apply' || undefined}
        >
          {change.pending === 'apply' && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          {confirmLabel}
        </Button>
      ) : hasFields ? (
        <Button type="submit" form={formId} disabled={busy} aria-busy={busy || undefined}>
          {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Review
        </Button>
      ) : null}
    </div>
  )
}
