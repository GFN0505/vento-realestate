import { useNavigate } from '@tanstack/react-router'
import { FileUpIcon, LoaderCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { LAND_COPY } from '@/features/land/land-words'
import { SheetFooter } from '@/features/land/parcel-sheet/sheet-parts'
import { SheetFrame } from '@/features/team/sheet-frame'
import { useOnline } from '@/lib/connection'
import { waitingForUploads } from '@/lib/upload/upload-item'
import { useSheetGuard } from '@/lib/use-sheet-guard'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import { LAND_HOME_COPY } from './land-home-words'
import { UPLOAD_FORM_ID, UploadDocumentFields } from './upload-document-fields'
import { useUploadDocument } from './use-upload-document'

export type UploadDocumentSheetProps = {
  open: boolean
  onClose: () => void
  entityId: string | undefined
}

/**
 * Upload document from Home (spec J-LND-02 phone path; side-sheet archetype, full screen on
 * phones): the parcel last used, the type guessed, **Take photo** or **Choose file**, **Upload
 * document**.
 * A fresh form for every opening; closing with a file or a choice asks first.
 */
export function UploadDocumentSheet({ open, onClose, entityId }: UploadDocumentSheetProps) {
  const height = useVisualViewportHeight(open)
  const [opening, setOpening] = useState({ open: false, count: 0 })
  if (open !== opening.open) setOpening({ open, count: opening.count + (open ? 1 : 0) })
  const [dirty, setDirty] = useState(false)
  const leave = useSheetGuard(open && dirty)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        if (dirty) leave.ask()
        else onClose()
      }}
    >
      <SheetFrame
        height={height}
        lead={
          <span
            aria-hidden
            className="tile-gradient mb-2 flex size-11 items-center justify-center rounded-xl text-tile-icon"
          >
            <FileUpIcon className="size-5" strokeWidth={1.8} />
          </span>
        }
        title={LAND_HOME_COPY.uploadDocument}
        description="Files into the parcel's vault. A type that's already there becomes a new version."
      >
        <UploadDocumentBody
          key={opening.count}
          entityId={entityId}
          onDirty={setDirty}
          onCancel={() => (dirty ? leave.ask() : onClose())}
          onDone={() => {
            leave.release()
            setDirty(false)
            onClose()
          }}
        />
      </SheetFrame>
      <ConfirmDialog
        open={leave.asking}
        onOpenChange={(next) => !next && leave.keepEditing()}
        title="Discard this upload?"
        confirmLabel="Discard upload"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDirty(false)
          leave.discard(onClose)
        }}
      >
        The document isn't filed yet. The file you added won't be kept.
      </ConfirmDialog>
    </Sheet>
  )
}

function UploadDocumentBody({
  entityId,
  onDirty,
  onCancel,
  onDone,
}: {
  entityId: string | undefined
  onDirty: (dirty: boolean) => void
  onCancel: () => void
  onDone: () => void
}) {
  const upload = useUploadDocument(entityId)
  const online = useOnline()
  const navigate = useNavigate()
  const { pendingCount, failedCount } = upload.uploads
  // The frame asks before closing only when something here would be lost.
  useEffect(() => onDirty(upload.dirty), [upload.dirty, onDirty])

  async function send() {
    const done = await upload.submit()
    if (!done) {
      window.requestAnimationFrame(focusFirstError)
      return
    }
    toast.success(done.toast, {
      action: {
        label: 'Open parcel',
        onClick: () =>
          void navigate({ to: '/land/$parcelId', params: { parcelId: done.parcelId } }),
      },
    })
    onDone()
  }

  const blocked = upload.pending || !online || pendingCount > 0 || failedCount > 0
  return (
    <>
      <UploadDocumentFields upload={upload} offline={!online} onSubmit={() => void send()} />
      <SheetFooter>
        <SaveErrorAlert error={upload.error} />
        {!online && (
          <p role="status" className="text-[13px] text-status-amber-fg">
            {LAND_COPY.offline}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="flex-1 max-md:hidden" />
          <Button variant="ghost" onClick={onCancel} className="max-md:h-11">
            Cancel
          </Button>
          <Button
            type="submit"
            form={UPLOAD_FORM_ID}
            disabled={blocked}
            aria-busy={upload.pending || undefined}
            className="max-md:h-11 max-md:flex-1"
          >
            {(upload.pending || pendingCount > 0) && (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            )}
            {pendingCount > 0 ? waitingForUploads(pendingCount) : LAND_HOME_COPY.uploadDocument}
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}

function focusFirstError() {
  const first = document.querySelector<HTMLElement>(
    `#${UPLOAD_FORM_ID} [aria-invalid="true"], #upload-file-error:not(:empty)`,
  )
  if (first?.id === 'upload-file-error') {
    document.querySelector<HTMLElement>(`#${UPLOAD_FORM_ID} input[type="file"]`)?.focus()
  } else first?.focus()
}
