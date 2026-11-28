import type { ParcelDetail } from '@vento/shared'
import { CircleAlertIcon, LoaderCircleIcon } from 'lucide-react'
import { useEffect } from 'react'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { Button } from '@/components/ui/button'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { LAND_COPY } from '@/features/land/land-words'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { useOnline } from '@/lib/connection'
import { can } from '@/lib/permissions'
import { hasFinePointer } from '@/lib/pointer'
import { failedUploadsLine, waitingForUploads } from '@/lib/upload/upload-item'
import { useSheetGuard } from '@/lib/use-sheet-guard'
import { focusFirstError, PARCEL_FORM_ID, ParcelForm, useParcelForm } from './parcel-form'
import { rememberedParcelDefaults, rememberParcelDefaults } from './parcel-memory'
import { previewStages, stagesToSend } from './parcel-stages'
import { createInputFrom, newParcelValues, parcelValues, updateInputFrom } from './parcel-values'
import { DiscardParcelConfirm, type Guard, SheetFooter } from './sheet-parts'
import { useParcelDocuments } from './use-parcel-documents'
import { useSaveParcel } from './use-save-parcel'

type Props = {
  /** null: Add parcel. */
  parcel: ParcelDetail | null
  guard: Guard
  onClose: () => void
  onSaved?: (parcel: ParcelDetail) => void
}

export function EditableParcel({ parcel, guard, onClose, onSaved }: Props) {
  const me = useMe()
  const { permissions } = useEffectiveAccess()
  const entity = useCurrentEntity()
  const online = useOnline()
  const organizationId = me.organization?.id
  const only = entity.options.length === 1 ? entity.options[0] : undefined
  const memory = rememberedParcelDefaults(organizationId)
  const lastCompany = entity.options.find((e) => e.id === memory.entityId)
  const form = useParcelForm(
    parcel
      ? parcelValues(parcel)
      : newParcelValues({
          // Spec: the company in the switcher, or the only one; else the one used last time.
          entityId: entity.entity?.id ?? only?.id ?? lastCompany?.id ?? '',
          state: memory.state,
        }),
  )
  const documents = useParcelDocuments()
  const dirty = form.formState.isDirty || (!parcel && documents.dirty)
  const leave = useSheetGuard(dirty)
  const save = useSaveParcel(form, parcel, (saved) => {
    guard.current = null
    leave.release()
    if (!parcel) documents.uploads.reset()
    onSaved?.(saved)
    // Add hands over to the new parcel's page; Edit just closes.
    if (parcel || !onSaved) onClose()
  })

  // The switcher's list may arrive after the sheet opened: pre-fill the company then.
  const fallbackCompany = only?.id ?? lastCompany?.id
  useEffect(() => {
    if (!parcel && fallbackCompany && form.getValues('entityId') === '') {
      form.setValue('entityId', fallbackCompany)
    }
  }, [parcel, fallbackCompany, form])

  guard.current = dirty
    ? () => {
        leave.ask()
        return false
      }
    : null

  const { pendingCount, failedCount } = documents.uploads
  // Spec open question 5: the cost and the seller follow Land & title edit or Finance view.
  const showMoney = parcel
    ? !parcel.costHidden && !parcel.sellerHidden
    : can(permissions, 'land', 'edit') || can(permissions, 'finance', 'view')

  const submit = form.handleSubmit(
    async (values) => {
      if (parcel) {
        await save.save(updateInputFrom(parcel, values, form.formState.dirtyFields))
        return
      }
      const described = documents.collect()
      if (!described.ok) {
        window.requestAnimationFrame(focusFirstError)
        return
      }
      const preview = previewStages(values.state, values.stages, documents.types)
      rememberParcelDefaults(organizationId, { state: values.state, entityId: values.entityId })
      await save.add(
        createInputFrom(values, described.documents, stagesToSend(values.state, preview)),
      )
    },
    () => {
      if (!parcel) documents.collect()
      window.requestAnimationFrame(focusFirstError)
    },
  )

  const blocked = save.pending || !online || pendingCount > 0 || failedCount > 0
  return (
    <>
      <ParcelForm
        form={form}
        parcel={parcel}
        companies={entity.options}
        showMoney={showMoney}
        documents={parcel ? null : documents}
        autoFocusName={!parcel && hasFinePointer()}
        offline={!online}
        onSubmit={() => void submit()}
      />
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
            form={PARCEL_FORM_ID}
            disabled={blocked || (parcel !== null && !form.formState.isDirty)}
            aria-busy={save.pending || undefined}
            className="max-md:h-11 max-md:flex-1"
          >
            {(save.pending || pendingCount > 0) && (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            )}
            {pendingCount > 0 ? waitingForUploads(pendingCount) : LAND_COPY.saveParcel}
          </Button>
        </div>
      </SheetFooter>
      <DiscardParcelConfirm
        open={leave.asking}
        onOpenChange={(open) => !open && leave.keepEditing()}
        adding={!parcel}
        onDiscard={() => {
          guard.current = null
          leave.discard(onClose)
        }}
      />
    </>
  )
}
