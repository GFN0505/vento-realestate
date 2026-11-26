import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Role, UpdateRoleInput } from '@vento/shared'
import { type RefObject, useState } from 'react'
import { toast } from 'sonner'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { roleQuery } from '@/features/settings/role-queries'
import { teamListKey } from '@/features/team/team-queries'
import {
  apiErrorMessage,
  errorReason,
  isAccessChanged,
  OFFLINE_SAVE_ERROR,
  toastApiError,
} from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { draftFrom, updateFrom } from './use-role-draft'

/** Undo stays on screen this long (spec: 8 seconds). */
export const UNDO_MS = 8000

type Roles = { items: Role[]; page: number; pageSize: number; total: number }

/** A saved role replaces its cached copies; Team and the role menus catch up. */
export function putRole(queryClient: QueryClient, saved: Role) {
  queryClient.setQueryData(roleQuery(saved.id).queryKey, saved)
  queryClient.setQueryData<Roles>(rolesQuery().queryKey, (list) =>
    list ? { ...list, items: list.items.map((r) => (r.id === saved.id ? saved : r)) } : list,
  )
  void queryClient.invalidateQueries({ queryKey: teamListKey() })
  void queryClient.invalidateQueries({ queryKey: rolesQuery().queryKey })
}

/**
 * Saves a role at once (spec question 8): no confirm, the bar already said who it reaches.
 * Someone else's save in between is refused ("… changed Site engineer a moment ago") and nothing
 * is overwritten. Offline, nothing changes and the ticks stay. Lives in the editor, which starts
 * again from each new version; Undo lives on the page (`useRoleUndo`).
 */
export function useSaveRole(onSaved: (before: Role, saved: Role) => void) {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function save(before: Role, input: UpdateRoleInput) {
    setError(null)
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return
    }
    setPending(true)
    try {
      const { role } = await client.roles.update(input)
      putRole(queryClient, role)
      onSaved(before, role)
    } catch (caught) {
      setError(caught)
    } finally {
      setPending(false)
    }
  }

  return {
    save,
    pending,
    error,
    /** Someone else saved it first: Reload shows theirs (the draft is dropped). */
    stale: errorReason(error) === 'role_changed' || isAccessChanged(error),
    /** Their own access changed: only a full reload shows what they may do now. */
    accessChanged: isAccessChanged(error),
    reload: (id: string) => {
      setError(null)
      return queryClient.refetchQueries({ queryKey: roleQuery(id).queryKey })
    },
    clearError: () => setError(null),
  }
}

export type SaveRoleApi = ReturnType<typeof useSaveRole>

type UndoTarget = { before: Role; saved: Role }

/**
 * "Site engineer saved · Undo". Undo is a second save back to the old values with the new
 * version. It outlives the editor (keyed by version), so its outcome always reaches the person:
 * a toast on success or failure, with Reload when someone else saved in between. With unsaved
 * ticks on the page, it asks first (`asking`).
 */
export function useRoleUndo(dirty: RefObject<boolean>) {
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState<UndoTarget | null>(null)
  const undo = useMutation({
    mutationFn: ({ before, saved }: UndoTarget) => {
      if (!connection.isOnline()) return Promise.reject(new Error(OFFLINE_SAVE_ERROR))
      return client.roles.update(updateFrom(saved, draftFrom(before)))
    },
    onSuccess: ({ role }) => {
      putRole(queryClient, role)
      toast.success(`${role.name} put back`)
    },
    onError: (error, { saved }) => {
      if (errorReason(error) === 'role_changed') {
        toast(apiErrorMessage(error), {
          action: {
            label: 'Reload',
            onClick: () =>
              void queryClient.refetchQueries({ queryKey: roleQuery(saved.id).queryKey }),
          },
        })
        return
      }
      if (error instanceof Error && error.message === OFFLINE_SAVE_ERROR) {
        toast.error(OFFLINE_SAVE_ERROR)
        return
      }
      toastApiError(error)
    },
  })

  const run = (target: UndoTarget) => {
    if (dirty.current) setAsking(target)
    else undo.mutate(target)
  }

  return {
    /** Shows the saved toast with Undo. */
    offer: (before: Role, saved: Role) =>
      toast.success(`${saved.name} saved`, {
        duration: UNDO_MS,
        action: { label: 'Undo', onClick: () => run({ before, saved }) },
      }),
    asking,
    confirm: () => {
      if (asking) undo.mutate(asking)
      setAsking(null)
    },
    cancel: () => setAsking(null),
  }
}
