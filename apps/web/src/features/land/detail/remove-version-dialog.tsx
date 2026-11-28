import { useQueryClient } from '@tanstack/react-query'
import { type DocumentVersion, removeVersionInput, type TitleDocument } from '@vento/shared'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import {
  apiErrorMessage,
  isHandledElsewhere,
  OFFLINE_SAVE_ERROR,
  toastApiError,
} from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { documentLabel } from '../land-words'
import { invalidateParcel } from '../parcels-queries'
import { DETAIL_COPY, UNDO_MS } from './detail-words'

export type RemoveTarget = { document: TitleDocument; version: DocumentVersion }

type Props = {
  parcelId: string
  target: RemoveTarget | null
  onClose: () => void
}

/**
 * "Remove survey plan v2?" (`pattern`, ConfirmDialog): a reason is required; the version leaves
 * the vault at once with Undo, and stays in the parcel's history with the reason. The file
 * itself is kept. Evidence behind a granted stage is refused with the server's words.
 */
export function RemoveVersionDialog({ parcelId, target, onClose }: Props) {
  const queryClient = useQueryClient()
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  // The dialog keeps its words while it fades out after the target clears.
  const [shown, setShown] = useState(target)
  if (target && target !== shown) {
    setShown(target)
    setReason('')
    setProblem(null)
  }
  const label = shown
    ? `${documentLabel(shown.document.type, shown.document.name)} v${shown.version.versionNo}`
    : ''

  async function remove() {
    if (!shown) return
    const parsed = removeVersionInput.safeParse({ versionId: shown.version.id, reason })
    if (!parsed.success) {
      setProblem(parsed.error.issues[0]?.message ?? 'Say why, e.g. wrong parcel')
      reasonRef.current?.focus()
      return
    }
    if (!connection.isOnline()) return setProblem(OFFLINE_SAVE_ERROR)
    setPending(true)
    try {
      await client.land.documents.removeVersion(parsed.data)
      invalidateParcel(queryClient, parcelId)
      const versionId = shown.version.id
      toast.success(DETAIL_COPY.versionRemoved(label), {
        duration: UNDO_MS,
        action: {
          label: 'Undo',
          onClick: () =>
            void client.land.documents.restoreVersion({ versionId }).then(() => {
              invalidateParcel(queryClient, parcelId)
              toast.success(DETAIL_COPY.versionRestored(label))
            }, toastApiError),
        },
      })
      onClose()
    } catch (error) {
      if (!isHandledElsewhere(error)) setProblem(apiErrorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open={target !== null}
      onOpenChange={(open) => !open && onClose()}
      title={`Remove ${label}?`}
      confirmLabel="Remove version"
      destructive
      pending={pending}
      initialFocus={reasonRef}
      onConfirm={() => void remove()}
      extra={
        <Field data-invalid={!!problem}>
          <FieldLabel htmlFor="remove-reason">Why are you removing it?</FieldLabel>
          <Textarea
            ref={reasonRef}
            id="remove-reason"
            rows={2}
            value={reason}
            placeholder="e.g. Wrong parcel"
            aria-invalid={!!problem}
            aria-describedby={problem ? 'remove-reason-error' : undefined}
            onChange={(event) => {
              setReason(event.target.value)
              if (problem) setProblem(null)
            }}
          />
          <FieldError id="remove-reason-error" role="alert">
            {problem}
          </FieldError>
        </Field>
      }
    >
      It stays in the parcel's history with your reason.
    </ConfirmDialog>
  )
}
