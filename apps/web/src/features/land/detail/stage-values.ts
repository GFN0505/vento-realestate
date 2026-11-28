import {
  allowsFollowUp,
  likelyNextStatus,
  type ParcelDetail,
  type StageUpdateStatus,
  type TitleStage,
  type UpdateStageInput,
  updateStageInput,
} from '@vento/shared'
import type { FieldErrors, Resolver } from 'react-hook-form'
import { todayInLagos } from '@/lib/format'
import { stageLabel } from '../land-words'

/*
 * What Update title stage holds while typing: strings ('' = none), so nothing typed is lost.
 * The shared schema checks the request it becomes; the sheet adds the rules that need the
 * stage as loaded (leaving granted needs a note, dates on or before today).
 */

export type StageFormValues = {
  status: StageUpdateStatus
  on: string
  reference: string
  issuedBy: string
  note: string
  followUpOn: string
}

/**
 * Likely next status pre-selected, today's date, the issuer last used for this stage type. When
 * that status is the one the stage already has (a granted stage reopened), its own date stays.
 */
export function stageDefaults(parcel: ParcelDetail, stage: TitleStage): StageFormValues {
  const status = likelyNextStatus(stage.status)
  return {
    status,
    on: status === stage.status && stage.statusOn ? stage.statusOn : todayInLagos(),
    reference: stage.reference ?? '',
    issuedBy: stage.issuedBy ?? parcel.suggestedIssuers[stage.type] ?? '',
    note: '',
    followUpOn: allowsFollowUp(stage.status) ? (stage.followUpOn ?? '') : '',
  }
}

export type StageContext = { stage: TitleStage; expectedVersion: number }

/** The request for these values (attachments are added by the sheet). */
export function stageInput(
  values: StageFormValues,
  { stage, expectedVersion }: StageContext,
): UpdateStageInput {
  return {
    id: stage.id,
    expectedVersion,
    status: values.status,
    on: values.on,
    reference: values.reference,
    issuedBy: values.issuedBy,
    note: values.note,
    followUpOn: allowsFollowUp(values.status) && values.followUpOn ? values.followUpOn : null,
    attachments: [],
  }
}

const FIELDS = ['status', 'on', 'reference', 'issuedBy', 'note', 'followUpOn'] as const
type Field = (typeof FIELDS)[number]
const isField = (key: unknown): key is Field => FIELDS.some((f) => f === key)

/** "Say what happened to the C of O." when a granted stage changes to anything else. */
export const leavingGrantedMessage = (stage: Pick<TitleStage, 'type'>) =>
  `Say what happened to the ${stageLabel(stage.type)}.`

export const stageResolver: Resolver<StageFormValues, StageContext> = (values, context) => {
  const errors: FieldErrors<StageFormValues> = {}
  const put = (field: Field, message: string) => {
    errors[field] ??= { type: 'validate', message }
  }
  if (!values.on) put('on', 'Enter the date')
  else if (values.on > todayInLagos()) put('on', 'Enter a date on or before today.')
  if (
    context &&
    context.stage.status === 'granted' &&
    values.status !== 'granted' &&
    !values.note.trim()
  ) {
    put('note', leavingGrantedMessage(context.stage))
  }
  if (context) {
    const parsed = updateStageInput.safeParse(stageInput(values, context))
    for (const issue of parsed.error?.issues ?? []) {
      const [field] = issue.path
      if (isField(field)) put(field, issue.message)
    }
  }
  return Object.keys(errors).length > 0 ? { values: {}, errors } : { values, errors: {} }
}
