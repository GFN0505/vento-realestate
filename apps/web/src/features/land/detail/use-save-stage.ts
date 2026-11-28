import { useQueryClient } from '@tanstack/react-query'
import type { ParcelDetail, TitleStage, UpdateStageInput } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { errorReason, OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { parcelQuery, refreshParcel } from '../parcels-queries'
import { DETAIL_COPY, stageSavedToast, UNDO_MS } from './detail-words'

/** Refusals that belong on a field; the rest go above the buttons. */
export type StageRefusal = { field: 'note' | 'on' | 'documents'; message: string } | null

function fieldRefusal(error: unknown): StageRefusal {
  if (!(error instanceof Error)) return null
  const reason = errorReason(error)
  if (reason === 'note_required') return { field: 'note', message: error.message }
  if (reason === 'future_date') return { field: 'on', message: error.message }
  if (reason === 'granted_needs_document') return { field: 'documents', message: error.message }
  return null
}

/** "C of O granted · Undo": Undo asks the server to put back the caller's own update. */
export function showStageToast(
  queryClient: ReturnType<typeof useQueryClient>,
  saved: ParcelDetail,
  stage: Pick<TitleStage, 'id' | 'type'>,
) {
  const after = saved.stages.find((s) => s.id === stage.id)
  if (!after) return
  toast.success(stageSavedToast(stage, after.status), {
    duration: UNDO_MS,
    action: after.canUndo
      ? {
          label: 'Undo',
          onClick: () =>
            void client.land.stages
              .undo({ id: after.id, expectedVersion: after.version })
              .then((restored) => {
                refreshParcel(queryClient, restored)
                toast.success(DETAIL_COPY.undone)
              }, toastApiError),
        }
      : undefined,
  })
}

/**
 * Save update. What was typed (and every attached file) stays on any refusal. When someone else
 * updated the stage first (CONFLICT `stale`, naming them), the latest stage is fetched so the
 * next Save is checked against it.
 */
export function useSaveStage(parcelId: string, stage: TitleStage, onSaved: () => void) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [refusal, setRefusal] = useState<StageRefusal>(null)
  const [expectedVersion, setExpectedVersion] = useState(stage.version)

  async function catchUp() {
    const latest = await queryClient
      .fetchQuery({ ...parcelQuery(parcelId), staleTime: 0 })
      .catch(() => null)
    if (!latest) return
    refreshParcel(queryClient, latest)
    const fresh = latest.stages.find((s) => s.id === stage.id)
    if (fresh) setExpectedVersion(fresh.version)
  }

  async function save(input: UpdateStageInput) {
    setError(null)
    setRefusal(null)
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return
    }
    setPending(true)
    try {
      const saved = await client.land.stages.update({ ...input, expectedVersion })
      refreshParcel(queryClient, saved)
      showStageToast(queryClient, saved, stage)
      onSaved()
    } catch (caught) {
      const onField = fieldRefusal(caught)
      if (onField) setRefusal(onField)
      else setError(caught)
      if (errorReason(caught) === 'stale') await catchUp()
    } finally {
      setPending(false)
    }
  }

  return { pending, error, refusal, expectedVersion, save, clearRefusal: () => setRefusal(null) }
}
