import { type Entity, PARCEL_STATUS_LABELS, type ParcelDetail } from '@vento/shared'
import { type Path, useForm, useWatch } from 'react-hook-form'
import { MoreOptions } from './more-options'
import { ParcelDocumentsField } from './parcel-documents'
import { ParcelFields } from './parcel-fields'
import { opensTitled, previewStages } from './parcel-stages'
import {
  type ParcelForm as ParcelFormApi,
  type ParcelFormValues,
  parcelResolver,
} from './parcel-values'
import { StagesField } from './stages-field'
import type { ParcelDocuments } from './use-parcel-documents'

export const PARCEL_FORM_ID = 'parcel-form'

/**
 * Checked on submit, then as fields change; before that, a field is checked when it's left
 * only if something was typed in it (see onBlurCapture), so tabbing past the cursor's first
 * field never shows "Enter a parcel name" before anything was asked.
 */
export function useParcelForm(defaultValues: ParcelFormValues) {
  return useForm<ParcelFormValues>({ resolver: parcelResolver, mode: 'onSubmit', defaultValues })
}

/** The first field with a problem gets the cursor (excellence checklist). */
export function focusFirstError(): void {
  document
    .querySelector<HTMLElement>(`#${PARCEL_FORM_ID} [aria-invalid="true"]`)
    ?.focus({ preventScroll: false })
}

type Props = {
  form: ParcelFormApi
  /** Edit: the parcel as loaded. Add: null. */
  parcel: ParcelDetail | null
  companies: readonly Entity[]
  showMoney: boolean
  /** Add only: the files dropped in, and the stages they grant. */
  documents: ParcelDocuments | null
  autoFocusName: boolean
  /** Uploads stop while offline; the drop zone says so by being disabled. */
  offline: boolean
  onSubmit: () => void
}

/**
 * Add / Edit parcel's fields (ParcelEditor board without the map until slice 3): the essentials,
 * then More options, then (Add only) Documents and the title stages they grant. Enter submits.
 */
export function ParcelForm({
  form,
  parcel,
  companies,
  showMoney,
  documents,
  autoFocusName,
  offline,
  onSubmit,
}: Props) {
  const [state, stages, status] = useWatch({
    control: form.control,
    name: ['state', 'stages', 'status'],
  })
  const preview = documents ? previewStages(state, stages, documents.types) : []
  const locked =
    parcel && (parcel.status === 'in_development' || parcel.status === 'sold_out')
      ? PARCEL_STATUS_LABELS[parcel.status]
      : null
  const statusNote =
    documents && opensTitled(status, preview)
      ? 'Opens as Titled: every stage has its document.'
      : parcel?.status === 'titled'
        ? 'Shows as Titled while every stage is granted.'
        : null
  const moreFilled = Boolean(
    parcel && (parcel.acquisition?.on || parcel.acquisition?.cost || parcel.seller || parcel.notes),
  )

  return (
    <form
      id={PARCEL_FORM_ID}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      onBlurCapture={(event) => {
        const name = (event.target as { name?: string }).name as Path<ParcelFormValues> | undefined
        if (name && form.getFieldState(name).isDirty) void form.trigger(name)
      }}
      className="flex flex-col gap-5"
    >
      <ParcelFields
        form={form}
        companies={companies}
        excludeId={parcel?.id}
        autoFocusName={autoFocusName}
        statusLocked={locked}
        statusNote={statusNote}
      />
      <MoreOptions form={form} showMoney={showMoney} defaultOpen={moreFilled} />
      {documents && (
        <>
          <ParcelDocumentsField documents={documents} disabled={offline} />
          <StagesField form={form} preview={preview} />
        </>
      )}
    </form>
  )
}
