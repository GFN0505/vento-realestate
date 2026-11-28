import { TITLE_DOCUMENT_TYPES, TITLE_DOCUMENTS, type TitleDocumentType } from '@vento/shared'
import { FileDrop } from '@/components/file-drop'
import { NativeSelect } from '@/components/native-select'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { DOCUMENT_TYPE_OPTIONS, LAND_COPY } from '@/features/land/land-words'
import { todayInLagos } from '@/lib/format'
import type { UploadItem } from '@/lib/upload/upload-item'
import { guessDocumentType } from './guess-type'
import type { ParcelDocuments } from './use-parcel-documents'

const asType = (value: string): TitleDocumentType | '' =>
  TITLE_DOCUMENT_TYPES.find((t) => t === value) ?? ''

/** Documents (spec step 3): drop or choose; each file uploads at once and says what it is. */
export function ParcelDocumentsField({
  documents,
  disabled,
}: {
  documents: ParcelDocuments
  disabled: boolean
}) {
  return (
    <section aria-labelledby="parcel-documents" className="flex flex-col gap-2">
      <h3 id="parcel-documents" className="font-semibold text-sm">
        Documents
      </h3>
      <FileDrop
        uploads={documents.uploads}
        title={LAND_COPY.dropTitle}
        takePhoto
        guessType={guessDocumentType}
        disabled={disabled}
        renderFile={(item) => <DocumentRowFields item={item} documents={documents} />}
      />
    </section>
  )
}

function DocumentRowFields({ item, documents }: { item: UploadItem; documents: ParcelDocuments }) {
  const draft = documents.draftOf(item)
  const errors = documents.errorsOf(item)
  const def = draft.type ? TITLE_DOCUMENTS[draft.type] : null
  const base = `doc-${item.key}`
  const typeLabel = `What is ${item.name}?`

  return (
    <div className="flex flex-col gap-2">
      <NativeSelect
        aria-label={typeLabel}
        value={draft.type}
        aria-invalid={!!errors.type}
        aria-describedby={errors.type ? `${base}-type-error` : undefined}
        onChange={(event) => documents.change(item, { type: asType(event.target.value) })}
        className="h-11 md:h-9"
      >
        <option value="" disabled>
          Choose a type
        </option>
        {DOCUMENT_TYPE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <FieldError id={`${base}-type-error`}>{errors.type}</FieldError>
      {def?.multiple && (
        <div className="flex flex-col gap-1">
          <Input
            aria-label={`Name of ${item.name}`}
            placeholder={draft.type === 'other' ? 'Query letter' : 'Adeyemi family (optional)'}
            value={draft.name}
            autoComplete="off"
            aria-invalid={!!errors.name}
            onChange={(event) => documents.change(item, { name: event.target.value })}
            className="h-11 md:h-9"
          />
          <FieldError>{errors.name}</FieldError>
        </div>
      )}
      {def?.stageType && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <Input
              aria-label={`Number on ${item.name}`}
              placeholder="Number (optional)"
              value={draft.number}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={!!errors.number}
              onChange={(event) => documents.change(item, { number: event.target.value })}
              className="h-11 tabular-nums md:h-9"
            />
            <FieldError>{errors.number}</FieldError>
          </div>
          <div className="flex flex-col gap-1">
            <Input
              type="date"
              aria-label={`Issue date of ${item.name}`}
              max={todayInLagos()}
              value={draft.issuedOn}
              aria-invalid={!!errors.issuedOn}
              onChange={(event) => documents.change(item, { issuedOn: event.target.value })}
              className="h-11 tabular-nums md:h-9"
            />
            <FieldError>{errors.issuedOn}</FieldError>
          </div>
        </div>
      )}
    </div>
  )
}
