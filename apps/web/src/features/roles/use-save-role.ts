import { useQueryClient } from '@tanstack/react-query'
import type { Role, UpdateRoleInput } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { teamListKey } from '@/features/team/team-queries'
import { errorReason, isAccessChanged, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { roleQuery } from './role-queries'
import { draftFrom, updateFrom } from './use-role-draft'

/** Undo stays on screen this long (spec: 8 seconds). */
const UNDO_MS = 8000

type Roles = { items: Role[]; page: number; pageSize: number; total: number }

/**
 * Saves a role at once with Undo (spec question 8): no confirm, the bar already said who it
 * reaches. Undo is a second save back to the old values, with the new version. Someone else's
 * save in between is refused ("… changed Site engineer a moment ago") and nothing is overwritten.
 * Offline, nothing changes and the ticks stay.
 */
export function useSaveRole() {
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const put = (saved: Role) => {
    queryClient.setQueryData(roleQuery(saved.id).queryKey, saved)
    queryClient.setQueryData<Roles>(rolesQuery().queryKey, (list) =>
      list ? { ...list, items: list.items.map((r) => (r.id === saved.id ? saved : r)) } : list,
    )
    // Team shows role names; its menus read the roles list.
    void queryClient.invalidateQueries({ queryKey: teamListKey() })
    void queryClient.invalidateQueries({ queryKey: rolesQuery().queryKey })
  }

  async function send(input: UpdateRoleInput): Promise<Role | null> {
    setError(null)
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return null
    }
    setPending(true)
    try {
      const { role } = await client.roles.update(input)
      put(role)
      return role
    } catch (caught) {
      setError(caught)
      return null
    } finally {
      setPending(false)
    }
  }

  /** `before` is the role as loaded; `input` what changed. */
  async function save(before: Role, input: UpdateRoleInput) {
    const saved = await send(input)
    if (!saved) return
    toast.success(`${saved.name} saved`, {
      duration: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          void send(updateFrom(saved, draftFrom(before))).then(
            (undone) => undone && toast.success(`${undone.name} put back`),
          )
        },
      },
    })
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
