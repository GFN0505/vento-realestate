import {
  documentTypeForStage,
  type ParcelDetail,
  type TitleStage,
  type TitleStageType,
} from '@vento/shared'
import { CircleAlertIcon, LoaderCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { useOnline } from '@/lib/connection'
import { failedUploadsLine, waitingForUploads } from '@/lib/upload/upload-item'
import { useSheetGuard } from '@/lib/use-sheet-guard'
import { LAND_COPY, stageLabel, stageStatusText } from '../land-words'
import { type Guard, SheetFooter } from '../parcel-sheet/sheet-parts'
import { StageDocuments } from './stage-documents'
import { StageFields } from './stage-fields'
import { DiscardUpdateConfirm, focusFirstError, STAGE_FORM_ID } from './stage-form-parts'
import {
  type StageContext,
  type StageFormValues,
  stageDefaults,
  stageInput,
  stageResolver,
} from './stage-values'
import { useSaveStage } from './use-save-stage'
import { useStageAttachments } from './use-stage-attachments'

type Props = {
  parcel: ParcelDetail
  stage: TitleStage
  guard: Guard
  onStage: (type: TitleStageType) => void
  onClose: () => void
}

export function StageForm({ parcel, stage, guard, onStage, onClose }: Props) {
  const formId = STAGE_FORM_ID
  const online = useOnline()
  const save = useSaveStage(parcel.id, stage, () => {
    guard.current = null
    leave.release()
    onClose()
  })
  const context: StageContext = { stage, expectedVersion: save.expectedVersion }
  const form = useForm<StageFormValues, StageContext>({
    resolver: stageResolver,
    context,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: stageDefaults(parcel, stage),
  })
  const status = useWatch({ control: form.control, name: 'status' })
  const attachments = useStageAttachments(stage.type, status)
  const [checked, setChecked] = useState(false)
  const hasVault = parcel.documents.some(
    (d) => d.type === documentTypeForStage(stage.type) && d.latest,
  )
  const label = stageLabel(stage.type)
  const missingEvidence = status === 'granted' && !hasVault && !attachments.hasEvidence
  const docsError =
    save.refusal?.field === 'documents'
      ? save.refusal.message
      : checked && missingEvidence
        ? `Attach the ${label} to mark it granted.`
        : null

  // A server refusal that belongs on a field lands there, with the cursor.
  const { refusal, clearRefusal } = save
  useEffect(() => {
    if (refusal?.field === 'note' || refusal?.field === 'on') {
      form.setError(refusal.field, { message: refusal.message }, { shouldFocus: true })
      clearRefusal()
    }
  }, [refusal, clearRefusal, form])

  const dirty = form.formState.isDirty || attachments.dirty
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
      if (missingEvidence || attachments.invalid) return focusFirstError()
      if (attachments.uploads.failedCount > 0) return
      await save.save({ ...stageInput(values, context), attachments: attachments.toSend() })
    },
    () => {
      setChecked(true)
      focusFirstError()
    },
  )

  const { pendingCount, failedCount } = attachments.uploads
  const blocked = save.pending || !online || pendingCount > 0 || failedCount > 0
  const resubmit = stage.status === 'rejected' && status === 'submitted'

  return (
    <>
      <form
        id={formId}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-5"
      >
        <Field>
          <FieldLabel htmlFor={`${formId}-stage`}>Stage</FieldLabel>
          <NativeSelect
            id={`${formId}-stage`}
            value={stage.type}
            disabled={dirty}
            aria-describedby={dirty ? `${formId}-stage-hint` : undefined}
            onChange={(event) => {
              const next = parcel.stages.find((s) => s.type === event.target.value)
              if (next) onStage(next.type)
            }}
          >
            {parcel.stages.map((s) => (
              <option key={s.id} value={s.type}>
                {stageLabel(s.type)} · {stageStatusText(s.status, s.statusOn)}
              </option>
            ))}
          </NativeSelect>
          {dirty && (
            <p id={`${formId}-stage-hint`} className="text-muted-foreground text-xs">
              Save or cancel this update to pick another stage.
            </p>
          )}
        </Field>
        <StageFields form={form} stage={stage} />
        <StageDocuments
          parcel={parcel}
          stage={stage}
          status={status}
          attachments={attachments}
          canAttach={parcel.can.create}
          disabled={!online}
          error={docsError}
          checked={checked}
        />
      </form>
      <SheetFooter>
        <SaveErrorAlert error={save.error} />
        {failedCount > 0 && (
          <p role="alert" className="flex gap-2 text-[13px] text-destructive">
            <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            {failedUploadsLine(failedCount)}
          </p>
        )}
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
            form={formId}
            disabled={blocked}
            aria-busy={save.pending || undefined}
            className="max-md:h-11 max-md:flex-1"
          >
            {(save.pending || pendingCount > 0) && (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            )}
            {pendingCount > 0
              ? waitingForUploads(pendingCount)
              : resubmit
                ? 'Resubmit'
                : 'Save update'}
          </Button>
        </div>
      </SheetFooter>
      <DiscardUpdateConfirm
        open={leave.asking}
        onKeepEditing={leave.keepEditing}
        onDiscard={() => {
          guard.current = null
          leave.discard(onClose)
        }}
      />
    </>
  )
}
