import { useId } from 'react'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import {
  DialogFrame,
  dialogBodyClass,
  dialogFooterClass,
} from '@/features/security/dialogs/dialog-frame'
import { ChangeBody, ChangeFooter } from './change-body'
import { type ChangeFrameProps, DiscardChange, useAutoPreview, useCloseGuard } from './change-sheet'
import { focusFirstField, useReturnFocus } from './focus'

/**
 * A change with no fields as a centred dialog (moving a stage, the kill switch): the preview
 * lines, the reason, the button naming the change. Full height on phones, like My security's.
 */
export function ChangeDialog(props: Omit<ChangeFrameProps, 'fields' | 'onReview'>) {
  const { open, onClose, change } = props
  const formId = useId()
  const guard = useCloseGuard(change, false, onClose)
  useAutoPreview(open, props.autoPreview)
  useReturnFocus()
  return (
    <>
      <DialogFrame
        open={open}
        busy={change.pending === 'apply'}
        onClose={guard.request}
        title={props.title}
        description={props.description}
        onOpenAutoFocus={focusFirstField}
      >
        <div className="flex min-h-0 flex-col max-md:h-full">
          <DialogBody className={`${dialogBodyClass} gap-4`}>
            <ChangeBody change={change} formId={formId} onNext={props.onNext} />
          </DialogBody>
          <DialogFooter className={dialogFooterClass}>
            <ChangeFooter
              change={change}
              formId={formId}
              hasFields={false}
              confirmLabel={props.confirmLabel}
              destructive={props.destructive}
              onCancel={guard.request}
            />
          </DialogFooter>
        </div>
      </DialogFrame>
      <DiscardChange guard={guard} />
    </>
  )
}
