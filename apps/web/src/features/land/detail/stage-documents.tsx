import {
  documentTypeForStage,
  type ParcelDetail,
  type StageUpdateStatus,
  TITLE_DOCUMENTS,
  type TitleStage,
} from '@vento/shared'
import { CircleCheckIcon } from 'lucide-react'
import { FileDrop } from '@/components/file-drop'
import { NativeSelect } from '@/components/native-select'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { UploadItem } from '@/lib/upload/upload-item'
import { DOCUMENT_TYPE_OPTIONS, LAND_COPY, stageLabel } from '../land-words'
import { versionName } from './detail-words'
import { asDocumentType, attachmentError, type StageAttachments } from './use-stage-attachments'

type Props = {
  parcel: ParcelDetail
  stage: TitleStage
  status: StageUpdateStatus
  attachments: StageAttachments
  /** People without Land & title create can't attach files. */
  canAttach: boolean
  disabled: boolean
  /** "Attach the C of O to mark it granted." after a refused Save. */
  error: string | null
  checked: boolean
}

/**
 * Documents in the stage sheet. Granted needs the stage's document: the one already in the
 * vault ("Uses C of O v1 from the vault") or a file dropped here. Other statuses take the
 * registry's letters, optional.
 */
export function StageDocuments({
  parcel,
  stage,
  status,
  attachments,
  canAttach,
  disabled,
  error,
  checked,
}: Props) {
  const type = documentTypeForStage(stage.type)
  const vault = parcel.documents.find((d) => d.type === type && d.latest)
  const granting = status === 'granted'
  const label = stageLabel(stage.type)

  return (
    <section aria-labelledby="stage-documents" data-documents className="flex flex-col gap-2">
      <h3 id="stage-documents" className="font-semibold text-[13px]">
        Documents
        {!granting && <span className="font-normal text-muted-foreground"> (optional)</span>}
      </h3>
      {granting && vault?.latest && (
        <p className="flex items-start gap-2 rounded-[10px] border border-status-emerald-border bg-status-emerald-bg px-3 py-2.5 text-[13px] text-status-emerald-fg">
          <CircleCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Uses {versionName(vault, vault.latest.versionNo)} from the vault.
            {canAttach && ' Drop a newer copy below to add it as the next version.'}
          </span>
        </p>
      )}
      {canAttach ? (
        <FileDrop
          uploads={attachments.uploads}
          title={granting ? `Drop the ${label} here, or choose a file` : LAND_COPY.dropTitle}
          takePhoto
          disabled={disabled}
          renderFile={(item) => (
            <AttachmentFields item={item} attachments={attachments} checked={checked} />
          )}
        />
      ) : (
        granting &&
        !vault && (
          <p className="text-[13px] text-muted-foreground">
            Only Land & legal can attach documents. Ask your organization owner to add the {label}.
          </p>
        )
      )}
      <FieldError role="alert" data-documents-error>
        {error}
      </FieldError>
    </section>
  )
}

function AttachmentFields({
  item,
  attachments,
  checked,
}: {
  item: UploadItem
  attachments: StageAttachments
  checked: boolean
}) {
  const draft = attachments.draftOf(item)
  const problem = checked ? attachmentError(draft) : null
  return (
    <div className="flex flex-col gap-2">
      <NativeSelect
        aria-label={`What is ${item.name}?`}
        value={draft.type}
        onChange={(event) => {
          const next = asDocumentType(event.target.value)
          if (next) attachments.change(item, { type: next })
        }}
        className="h-11 md:h-9"
      >
        {DOCUMENT_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      {TITLE_DOCUMENTS[draft.type].multiple && (
        <div className="flex flex-col gap-1">
          <Input
            aria-label={`Name of ${item.name}`}
            placeholder={draft.type === 'other' ? 'Query letter' : 'Adeyemi family (optional)'}
            value={draft.name}
            autoComplete="off"
            aria-invalid={!!problem}
            onChange={(event) => attachments.change(item, { name: event.target.value })}
            className="h-11 md:h-9"
          />
          <FieldError>{problem}</FieldError>
        </div>
      )}
    </div>
  )
}
