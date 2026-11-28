import { Link } from '@tanstack/react-router'
import { TITLE_DOCUMENTS } from '@vento/shared'
import { FileDrop } from '@/components/file-drop'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DOCUMENT_TYPE_OPTIONS, LAND_COPY } from '@/features/land/land-words'
import { guessDocumentType } from '@/features/land/parcel-sheet/guess-type'
import { asDocumentType } from './upload-defaults'
import type { UploadDocument } from './use-upload-document'

export const UPLOAD_FORM_ID = 'upload-document-form'

const control = 'h-11 md:h-9'

/** Parcel, document type, its name where it takes one, then the photo or file. */
export function UploadDocumentFields({
  upload,
  offline,
  onSubmit,
}: {
  upload: UploadDocument
  offline: boolean
  onSubmit: () => void
}) {
  const { draft, errors, list, parcels } = upload
  const def = draft.type ? TITLE_DOCUMENTS[draft.type] : null
  return (
    <form
      id={UPLOAD_FORM_ID}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upload-parcel">Parcel</Label>
        {list.isError && !list.data ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
            {LAND_COPY.loadError}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void list.refetch()}
              disabled={list.isFetching}
              className="max-md:h-11"
            >
              Try again
            </Button>
          </p>
        ) : list.data && parcels.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No parcels to file into yet.{' '}
            <Link to="/land" search={{ sheet: 'add' }} className="font-semibold text-link">
              {LAND_COPY.addParcel}
            </Link>
          </p>
        ) : (
          <NativeSelect
            id="upload-parcel"
            name="parcel"
            value={draft.parcelId}
            disabled={!list.data}
            aria-invalid={!!errors.parcelId}
            aria-describedby={errors.parcelId ? 'upload-parcel-error' : undefined}
            onChange={(event) => upload.setParcel(event.target.value)}
            className={control}
          >
            <option value="" disabled>
              {list.data ? 'Choose a parcel' : 'Loading parcels…'}
            </option>
            {parcels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.reference}
              </option>
            ))}
          </NativeSelect>
        )}
        <FieldError id="upload-parcel-error">{errors.parcelId}</FieldError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="upload-type">Document</Label>
        <NativeSelect
          id="upload-type"
          name="type"
          value={draft.type}
          aria-invalid={!!errors.type}
          aria-describedby={errors.type ? 'upload-type-error' : undefined}
          onChange={(event) => upload.setType(asDocumentType(event.target.value))}
          className={control}
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
        <FieldError id="upload-type-error">{errors.type}</FieldError>
      </div>

      {def?.multiple && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="upload-name">Name{draft.type === 'other' ? '' : ' (optional)'}</Label>
          <Input
            id="upload-name"
            name="document-name"
            autoComplete="off"
            enterKeyHint="done"
            placeholder={draft.type === 'other' ? 'Query letter' : 'Adeyemi family'}
            value={draft.name}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'upload-name-error' : undefined}
            onChange={(event) => upload.setName(event.target.value)}
            className={control}
          />
          <FieldError id="upload-name-error">{errors.name}</FieldError>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="font-medium text-sm">Photo or file</span>
        <FileDrop
          uploads={upload.uploads}
          multiple={false}
          takePhoto
          guessType={guessDocumentType}
          title="A photo or PDF of the document"
          disabled={offline}
        />
        <FieldError id="upload-file-error">{errors.file}</FieldError>
      </div>
    </form>
  )
}
