import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { FormAlert } from '@/components/auth/form-alert'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Sheet } from '@/components/ui/sheet'
import { SheetFrame } from '@/features/team/sheet-frame'
import { ChangeBody, ChangeFooter } from './change-body'
import type { ChangeNext } from './change-errors'
import { focusFirstField, useReturnFocus } from './focus'
import type { ChangeController } from './use-change'

export type ChangeFrameProps = {
  open: boolean
  onClose: () => void
  /** The fields step's title ("Change plan"); the review step asks ("Move … to Growth?"). */
  title: string
  reviewTitle?: string
  description?: ReactNode
  change: ChangeController
  /** The fields; leave out for a change with none (the preview runs on open). */
  fields?: ReactNode
  onReview?: () => void
  /** Review-only changes: what to preview on open. */
  autoPreview?: () => void
  confirmLabel: string
  destructive?: boolean
  /** The fields differ from their defaults. */
  fieldsDirty?: boolean
  /** Nothing can be changed (e.g. no trial to end): this line and **Close**, no preview. */
  notice?: ReactNode
  onNext?: (next: ChangeNext) => void
}

/** Review-only changes preview as soon as they open. */
export function useAutoPreview(open: boolean, run: (() => void) | undefined) {
  const ran = useRef(false)
  useEffect(() => {
    if (!open) {
      ran.current = false
      return
    }
    if (run && !ran.current) {
      ran.current = true
      run()
    }
  }, [open, run])
}

/** Closing with something typed asks first (warn about unsaved changes on dialogs). */
export function useCloseGuard(change: ChangeController, fieldsDirty: boolean, onClose: () => void) {
  const [asking, setAsking] = useState(false)
  return {
    asking,
    request() {
      if (change.pending === 'apply') return
      if (change.dirty || fieldsDirty) setAsking(true)
      else onClose()
    },
    keep: () => setAsking(false),
    discard() {
      setAsking(false)
      onClose()
    },
  }
}

export function DiscardChange({ guard }: { guard: ReturnType<typeof useCloseGuard> }) {
  return (
    <ConfirmDialog
      open={guard.asking}
      onOpenChange={(open) => !open && guard.keep()}
      title="Discard this change?"
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      destructive
      onConfirm={guard.discard}
    >
      Nothing has been changed yet. What you typed won't be kept.
    </ConfirmDialog>
  )
}

/** A change as a side sheet (plan §9.4): fields → preview and reason → the named button. */
export function ChangeSheet(props: ChangeFrameProps) {
  const { open, onClose, change, fields, fieldsDirty = false } = props
  const formId = useId()
  const guard = useCloseGuard(change, fieldsDirty, onClose)
  useAutoPreview(open, fields || props.notice ? undefined : props.autoPreview)
  useReturnFocus()
  const review = change.step === 'review'
  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && guard.request()}>
        <SheetFrame
          title={review && props.reviewTitle ? props.reviewTitle : props.title}
          description={props.description}
          onInteractOutside={(event) => change.pending === 'apply' && event.preventDefault()}
          onOpenAutoFocus={focusFirstField}
          footer={
            <ChangeFooter
              change={change}
              formId={formId}
              hasFields={Boolean(fields)}
              confirmLabel={props.confirmLabel}
              destructive={props.destructive}
              onCancel={guard.request}
            />
          }
        >
          {props.notice ? (
            <FormAlert variant="info">{props.notice}</FormAlert>
          ) : (
            <ChangeBody
              change={change}
              formId={formId}
              fields={fields}
              onReview={props.onReview}
              onNext={props.onNext}
            />
          )}
        </SheetFrame>
      </Sheet>
      <DiscardChange guard={guard} />
    </>
  )
}
