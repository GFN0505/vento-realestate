import type { ParcelDetail, TitleDocument, TitleDocumentDef } from '@vento/shared'
import type { UseFormReturn } from 'react-hook-form'
import { NativeSelect } from '@/components/native-select'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { todayInLagos } from '@/lib/format'
import { DOCUMENT_TYPE_OPTIONS } from '../land-words'
import { versionName } from './detail-words'
import type { UploadFormValues } from './upload-values'

type Props = {
  form: UseFormReturn<UploadFormValues>
  parcel: ParcelDetail
  /** The vault document this becomes a version of, if any. */
  target: TitleDocument | undefined
  def: TitleDocumentDef | null
}

const optional = <span className="font-normal text-muted-foreground"> (optional)</span>

/** Type (and name where the type takes one), then the paper's facts for a stage's document. */
export function UploadFields({ form, parcel, target, def }: Props) {
  const { errors } = form.formState
  const separate = form.watch('separate')
  const type = form.watch('type')
  const canSeparate = def?.multiple && type !== 'other' && (target !== undefined || separate)
  const err = (field: keyof UploadFormValues) =>
    errors[field] ? `upload-${field}-error` : undefined

  return (
    <>
      <Field data-invalid={!!errors.type}>
        <FieldLabel htmlFor="upload-type">Document type</FieldLabel>
        <NativeSelect
          id="upload-type"
          aria-invalid={!!errors.type}
          aria-describedby={err('type') ?? (target ? 'upload-type-hint' : undefined)}
          {...form.register('type')}
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
        {target?.latest && (
          <p id="upload-type-hint" className="text-muted-foreground text-xs">
            {versionName(target, target.latest.versionNo)} is already here, so this becomes v
            {target.latest.versionNo + 1}.
          </p>
        )}
        <FieldError id="upload-type-error">{errors.type?.message}</FieldError>
      </Field>
      {def?.multiple && (
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="upload-name">
            Name{type !== 'other' && !separate && optional}
          </FieldLabel>
          <Input
            id="upload-name"
            autoComplete="off"
            placeholder={type === 'other' ? 'Query letter' : 'Adeyemi family'}
            aria-invalid={!!errors.name}
            aria-describedby={err('name')}
            {...form.register('name')}
          />
          <FieldError id="upload-name-error">{errors.name?.message}</FieldError>
          {canSeparate && (
            <button
              type="button"
              onClick={() => form.setValue('separate', !separate, { shouldDirty: true })}
              className="w-fit rounded-sm text-left font-semibold text-[13px] text-link outline-hidden hover:text-link-hover focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:py-2"
            >
              {separate ? 'Add as a new version instead' : 'Add as a separate document'}
            </button>
          )}
        </Field>
      )}
      {def?.stageType && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.number}>
            <FieldLabel htmlFor="upload-number">Number{optional}</FieldLabel>
            <Input
              id="upload-number"
              autoComplete="off"
              spellCheck={false}
              className="tabular-nums"
              aria-invalid={!!errors.number}
              aria-describedby={err('number')}
              {...form.register('number')}
            />
            <FieldError id="upload-number-error">{errors.number?.message}</FieldError>
          </Field>
          <Field data-invalid={!!errors.issuedOn}>
            <FieldLabel htmlFor="upload-issuedOn">Issue date{optional}</FieldLabel>
            <Input
              id="upload-issuedOn"
              type="date"
              max={todayInLagos()}
              className="tabular-nums"
              aria-invalid={!!errors.issuedOn}
              aria-describedby={err('issuedOn')}
              {...form.register('issuedOn')}
            />
            <FieldError id="upload-issuedOn-error">{errors.issuedOn?.message}</FieldError>
          </Field>
          <Field data-invalid={!!errors.issuedBy} className="sm:col-span-2">
            <FieldLabel htmlFor="upload-issuedBy">Issued by{optional}</FieldLabel>
            <Input
              id="upload-issuedBy"
              autoComplete="organization"
              placeholder={parcel.state === 'FCT' ? 'AGIS, Abuja' : 'Lands Bureau'}
              aria-invalid={!!errors.issuedBy}
              aria-describedby={err('issuedBy')}
              {...form.register('issuedBy')}
            />
            <FieldError id="upload-issuedBy-error">{errors.issuedBy?.message}</FieldError>
          </Field>
        </div>
      )}
      <Field data-invalid={!!errors.note}>
        <FieldLabel htmlFor="upload-note">Note for this version{optional}</FieldLabel>
        <Textarea
          id="upload-note"
          rows={2}
          placeholder="e.g. Stamped copy from Lands Bureau"
          aria-invalid={!!errors.note}
          aria-describedby={err('note')}
          {...form.register('note')}
        />
        <FieldError id="upload-note-error">{errors.note?.message}</FieldError>
      </Field>
    </>
  )
}
