import type { QueryClient } from '@tanstack/react-query'
import type { Checklist } from '@vento/shared'
import { toast } from 'sonner'
import { toastApiError } from '@/lib/api-errors'
import { client } from '@/lib/orpc'
import { checklistQuery } from './checklist-queries'

/*
 * Hide (with Undo) and Show, per person on every device. Loaded only when someone hides the card
 * or asks for it back, so Home's first load stays small.
 */

function setHidden(queryClient: QueryClient, hidden: boolean): Promise<void> {
  const key = checklistQuery().queryKey
  const before = queryClient.getQueryData<Checklist>(key)
  // Gone (or back) at once; put back if the server refuses.
  queryClient.setQueryData<Checklist>(key, (c) => c && { ...c, hidden, shown: !hidden })
  const call = hidden ? client.checklist.hide() : client.checklist.show()
  return call.then(
    () => void queryClient.invalidateQueries({ queryKey: key }),
    (error: unknown) => {
      queryClient.setQueryData(key, before)
      toastApiError(error)
      throw error
    },
  )
}

export function hideChecklist(queryClient: QueryClient): void {
  setHidden(queryClient, true).then(
    () =>
      toast.success('Checklist hidden', {
        duration: 8000,
        action: { label: 'Undo', onClick: () => void showChecklist(queryClient) },
      }),
    () => undefined,
  )
}

/** ⌘K "Show setup checklist", and Undo. */
export function showChecklist(queryClient: QueryClient): Promise<void> {
  return setHidden(queryClient, false).catch(() => undefined)
}
