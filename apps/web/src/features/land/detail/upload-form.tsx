import { useQueryClient } from '@tanstack/react-query'
import { type ParcelDetail, TITLE_DOCUMENTS, type TitleDocument } from '@vento/shared'
import { LoaderCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { FileDrop } from '@/components/file-drop'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection, useOnline } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { waitingForUploads } from '@/lib/upload/upload-item'
import { useFileUpload } from '@/lib/upload/use-file-upload'
import { useSheetGuard } from '@/lib/use-sheet-guard'
import { LAND_COPY } from '../land-words'
import { guessDocumentType } from '../parcel-sheet/guess-type'
import { DiscardParcelConfirm, type Guard, SheetFooter } from '../parcel-sheet/sheet-parts'
import { invalidateParcel } from '../parcels-queries'
import { DETAIL_COPY, versionName } from './detail-words'
import { UploadFields } from './upload-fields'
import {
  type UploadFormValues,
  uploadDefaults,
  uploadInput,
  uploadResolver,
  versionTarget,
} from './upload-values'
import { asDocumentType } from './use-stage-attachments'

const FORM_ID = 'upload-form'

type Props = {
  parcel: ParcelDetail
  doc: TitleDocument | undefined
  guard: Guard
  onClose: () => void
}

/** One file, what it is, and its facts; a type that's already here becomes its next version. */
export function UploadForm({ parcel, doc, guard, onClose }: Props) {
  const queryClient = useQueryClient()
  const online = useOnline()
  const uploads = useFileUpload({ purpose: 'title_document' })
  const form = useForm<UploadFormValues>({
    resolver: uploadResolver,
    mode: 'onSubmit',
    defaultValues: uploadDefaults(parcel, doc),
  })
  const [type, name, separate] = useWatch({
    control: form.control,
    name: ['type', 'name', 'separate'],
  })
  const target = versionTarget(parcel, { type, name, separate })
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const file = uploads.done[0]
  const fileMissing = checked && !file && uploads.pendingCount === 0

  // A file's name is a better guess than the current stage (survey, c of o, deed…), unless
  // the type came from a row's Upload new version or the person picked one.
  const guess = asDocumentType(uploads.items[0]?.guess ?? '')
  useEffect(() => {
    if (guess && !doc && !form.getFieldState('type').isDirty) {
      form.setValue('type', guess, { shouldDirty: false })
    }
  }, [guess, doc, form])

  const dirty = form.formState.isDirty || uploads.items.length > 0
  const leave = useSheetGuard(dirty)
  guard.current = dirty
    ? () => {
        leave.ask()
        return false
      }
    : null

  const submit = form.handleSubmit(
    async (values) => {
      setChecked(true)
      if (!file?.fileId) return
      setError(null)
      if (!connection.isOnline()) return setError(new Error(OFFLINE_SAVE_ERROR))
      setPending(true)
      try {
        const saved = await client.land.documents.upload(
          uploadInput(parcel.id, file.fileId, values),
        )
        guard.current = null
        leave.release()
        uploads.reset()
        invalidateParcel(queryClient, parcel.id)
        toast.success(DETAIL_COPY.uploaded(versionName(saved.document, saved.version.versionNo)))
        onClose()
      } catch (caught) {
        setError(caught)
      } finally {
        setPending(false)
      }
    },
    () => {
      setChecked(true)
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`#${FORM_ID} [aria-invalid="true"]`)?.focus(),
      )
    },
  )

  const { pendingCount } = uploads
  const def = type ? TITLE_DOCUMENTS[type] : null
  // Not "Upload as v3": a removed newer version still holds its number, and only the server knows.
  const action = target?.latest ? 'Upload new version' : DETAIL_COPY.uploadDocument

  return (
    <>
      <form
        id={FORM_ID}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1.5">
          <FileDrop
            uploads={uploads}
            title="Drop a PDF or photo here, or choose a file"
            hint={DETAIL_COPY.vaultHint}
            multiple={false}
            takePhoto
            guessType={guessDocumentType}
            disabled={!online}
          />
          <FieldError role="alert">{fileMissing ? 'Choose a file to upload' : null}</FieldError>
        </div>
        <UploadFields form={form} parcel={parcel} target={target} def={def} />
      </form>
      <SheetFooter>
        <SaveErrorAlert error={error} />
        {!online && (
          <p role="status" className="text-[13px] text-status-amber-fg">
            {LAND_COPY.offline}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <Button
            variant="ghost"
            onClick={() => (dirty ? leave.ask() : onClose())}
            className="max-md:h-11"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            disabled={pending || !online || pendingCount > 0 || uploads.failedCount > 0}
            aria-busy={pending || undefined}
            className="max-md:h-11 max-md:flex-1"
          >
            {(pending || pendingCount > 0) && (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            )}
            {pendingCount > 0 ? waitingForUploads(pendingCount) : action}
          </Button>
        </div>
      </SheetFooter>
      <DiscardParcelConfirm
        open={leave.asking}
        onOpenChange={(open) => !open && leave.keepEditing()}
        adding={false}
        onDiscard={() => {
          guard.current = null
          leave.discard(onClose)
        }}
      />
    </>
  )
}
