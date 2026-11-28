import { useQueryClient } from '@tanstack/react-query'
import type { CreateParcelInput, ParcelDetail, UpdateParcelInput } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { parcelAddedToast, parcelUpdatedToast } from '@/features/land/land-words'
import { parcelQuery, refreshParcel } from '@/features/land/parcels-queries'
import { errorReason, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import type { ParcelForm } from './parcel-values'

/** Refusals that belong on a field rather than above the buttons. */
const FIELD_REASONS = {
  lga_not_in_state: 'lga',
  future_date: 'acquiredOn',
} as const

function fieldFor(reason: string | null) {
  if (reason === 'lga_not_in_state' || reason === 'future_date') return FIELD_REASONS[reason]
  return undefined
}

/**
 * Add or save a parcel. What was typed (and every uploaded file) stays on any refusal: a field's
 * problem goes on the field, anything else (someone saved it first, a full vault, a document
 * name already used, a company archived meanwhile) in a line above the buttons. When someone
 * saved it first (CONFLICT `stale`), the latest parcel is fetched so the next Save is checked
 * against it rather than refused again.
 */
export function useSaveParcel(
  form: ParcelForm,
  parcel: Pick<ParcelDetail, 'id' | 'version'> | null,
  onSaved: (parcel: ParcelDetail) => void,
) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [expectedVersion, setExpectedVersion] = useState(parcel?.version)

  async function catchUp(id: string) {
    const latest = await queryClient
      .fetchQuery({ ...parcelQuery(id), staleTime: 0 })
      .catch(() => null)
    if (!latest) return
    refreshParcel(queryClient, latest)
    setExpectedVersion(latest.version)
  }

  async function run(call: () => Promise<ParcelDetail>, toastText: (p: ParcelDetail) => string) {
    setError(null)
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return false
    }
    setPending(true)
    try {
      const saved = await call()
      refreshParcel(queryClient, saved)
      toast.success(toastText(saved))
      onSaved(saved)
      return true
    } catch (caught) {
      const field = fieldFor(errorReason(caught))
      if (field && caught instanceof Error && (field !== 'acquiredOn' || form.getValues(field))) {
        form.setError(field, { message: caught.message }, { shouldFocus: true })
      } else {
        setError(caught)
      }
      if (parcel && errorReason(caught) === 'stale') await catchUp(parcel.id)
      return false
    } finally {
      setPending(false)
    }
  }

  return {
    pending,
    error,
    clearError: () => setError(null),
    add: (input: CreateParcelInput) =>
      run(
        () => client.land.parcels.create(input),
        (p) => parcelAddedToast(p.name),
      ),
    save: (input: UpdateParcelInput) =>
      run(
        () =>
          client.land.parcels.update({
            ...input,
            expectedVersion: expectedVersion ?? input.expectedVersion,
          }),
        (p) => parcelUpdatedToast(p.name),
      ),
  }
}

export type SaveParcel = ReturnType<typeof useSaveParcel>
