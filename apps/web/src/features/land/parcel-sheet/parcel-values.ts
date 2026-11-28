import { zodResolver } from '@hookform/resolvers/zod'
import {
  CHOSEN_PARCEL_STATUSES,
  type ChosenParcelStatus,
  type CreateParcelInput,
  createParcelInput,
  type NewDocumentInput,
  type NigerianState,
  type ParcelDetail,
  type SizeUnit,
  type TitleStageType,
  type UpdateParcelInput,
} from '@vento/shared'
import type { FieldErrors, Resolver, UseFormReturn } from 'react-hook-form'
import { todayInLagos } from '@/lib/format'

/*
 * What Add / Edit parcel holds while typing: strings for every field ('' = none), so inputs stay
 * controlled and nothing typed is ever lost. The shared schema checks the request it becomes.
 */

export type ParcelFormValues = {
  name: string
  /** '' until a state is chosen; the schema answers "Choose a state". */
  state: NigerianState | ''
  lga: string
  area: string
  size: { value: string; unit: SizeUnit; plotSizeSqm: string }
  status: ChosenParcelStatus
  entityId: string
  acquiredOn: string
  /** Decimal string from MoneyInput. */
  acquisitionCost: string
  seller: string
  notes: string
  /** null: the state's default stages. Add only. */
  stages: TitleStageType[] | null
}

export type ParcelForm = UseFormReturn<ParcelFormValues>

export function newParcelValues(defaults: {
  entityId: string
  state: NigerianState | ''
}): ParcelFormValues {
  return {
    name: '',
    state: defaults.state,
    lga: '',
    area: '',
    size: { value: '', unit: 'ha', plotSizeSqm: '' },
    // Spec: Under acquisition is the usual starting point.
    status: 'under_acquisition',
    entityId: defaults.entityId,
    acquiredOn: '',
    acquisitionCost: '',
    seller: '',
    notes: '',
    stages: null,
  }
}

const isChosen = (status: string): status is ChosenParcelStatus =>
  (CHOSEN_PARCEL_STATUSES as readonly string[]).includes(status)

/** Edit: the parcel as loaded. A titled parcel reads Acquired (titled is worked out). */
export function parcelValues(parcel: ParcelDetail): ParcelFormValues {
  return {
    name: parcel.name,
    state: parcel.state,
    lga: parcel.lga,
    area: parcel.area ?? '',
    size: {
      // Stored to 4 decimals ("4.2000"): shown as it was typed.
      value: trimZeros(parcel.sizeEntered),
      unit: parcel.sizeUnit,
      plotSizeSqm: parcel.plotSizeSqm ? trimZeros(parcel.plotSizeSqm) : '',
    },
    status: isChosen(parcel.status) ? parcel.status : 'acquired',
    entityId: parcel.entity.id,
    acquiredOn: parcel.acquisition?.on ?? '',
    acquisitionCost: parcel.acquisition?.cost ? trimZeros(parcel.acquisition.cost) : '',
    seller: parcel.seller ?? '',
    notes: parcel.notes ?? '',
    stages: null,
  }
}

/** "600.00" → "600", "648.50" → "648.5": as a person would type it. */
function trimZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value
}

const orNull = (text: string) => (text.trim() === '' ? null : text)

/** The parcel's fields as the API takes them (create and update share them). */
function fieldsFrom(values: ParcelFormValues) {
  const plots = values.size.unit === 'plots'
  return {
    name: values.name,
    // '' is refused by the schema with "Choose a state"; the cast only satisfies the type.
    state: values.state as NigerianState,
    lga: values.lga,
    area: values.area,
    size: {
      value: values.size.value,
      unit: values.size.unit,
      plotSizeSqm: plots ? orNull(values.size.plotSizeSqm) : null,
    },
    status: values.status,
    entityId: values.entityId,
    acquiredOn: orNull(values.acquiredOn),
    acquisitionCost: orNull(values.acquisitionCost),
    seller: values.seller,
    notes: values.notes,
  }
}

/** Add parcel's request. `stages` only when they differ from the state's defaults. */
export function createInputFrom(
  values: ParcelFormValues,
  documents: NewDocumentInput[],
  stages?: TitleStageType[],
): CreateParcelInput {
  return { ...fieldsFrom(values), documents, ...(stages && { stages }) }
}

type DirtyFields = Partial<Record<keyof ParcelFormValues, unknown>>

/**
 * Edit parcel's request: only what changed, so two people fixing different fields both win.
 * State and LGA travel together (the LGA is checked against the state). Hidden cost and seller
 * fields are never sent.
 */
export function updateInputFrom(
  parcel: Pick<ParcelDetail, 'id' | 'version'>,
  values: ParcelFormValues,
  dirty: DirtyFields,
): UpdateParcelInput {
  const all = fieldsFrom(values)
  const keys = [
    'name',
    'area',
    'size',
    'status',
    'entityId',
    'acquiredOn',
    'acquisitionCost',
    'seller',
    'notes',
  ] as const
  const patch: UpdateParcelInput = { id: parcel.id, expectedVersion: parcel.version }
  for (const key of keys) if (dirty[key]) Object.assign(patch, { [key]: all[key] })
  if (dirty.state || dirty.lga) Object.assign(patch, { state: all.state, lga: all.lga })
  return patch
}

const fieldsResolver = zodResolver(createParcelInput)

/**
 * Checks the fields with the shared Add parcel schema (Edit sends a subset of the same fields).
 * Documents are checked on their own rows, so none are passed here.
 */
export const parcelResolver: Resolver<ParcelFormValues> = async (values, context, options) => {
  const result = await fieldsResolver(
    createInputFrom(values, [], values.stages ?? undefined),
    context,
    // The option names are the same fields; only their declared type differs.
    options as unknown as Parameters<typeof fieldsResolver>[2],
  )
  const errors = result.errors as FieldErrors<ParcelFormValues>
  if (values.acquiredOn && values.acquiredOn > todayInLagos()) {
    errors.acquiredOn = { type: 'future_date', message: 'Enter a date on or before today.' }
  }
  return Object.keys(errors).length > 0 ? { values: {}, errors } : { values, errors: {} }
}
