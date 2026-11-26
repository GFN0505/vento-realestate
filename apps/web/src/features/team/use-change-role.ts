import { type QueryKey, useQueryClient } from '@tanstack/react-query'
import type { ListTeamOutput, RoleRef, TeamMemberRow } from '@vento/shared'
import { toast } from 'sonner'
import { OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { teamListKey } from './team-queries'

/** Undo stays on screen this long (spec: 8 seconds). */
export const UNDO_MS = 8000

/** What the API takes for a row's current entity access: null = all entities. */
export function currentEntityIds(row: Pick<TeamMemberRow, 'access'>): string[] | null {
  return row.access.kind === 'all' ? null : row.access.entities.map((e) => e.id)
}

export function replaceRow(
  data: ListTeamOutput | undefined,
  id: string,
  next: (row: TeamMemberRow) => TeamMemberRow,
): ListTeamOutput | undefined {
  if (!data) return data
  return {
    ...data,
    items: data.items.map((row) => (row.kind === 'member' && row.id === id ? next(row) : row)),
  }
}

type Options = {
  /** Make owner was confirmed first, so there's no Undo (spec). */
  undo?: boolean
  onError?: (error: unknown, row: TeamMemberRow) => void
}

/**
 * A role picked from the row's menu saves at once (spec: 2 clicks). The row changes before the
 * server answers; a refusal puts it back and says why. Undo saves the previous role and limits
 * as a second change. Offline, nothing changes optimistically.
 */
export function useChangeRole(listKey: QueryKey) {
  const queryClient = useQueryClient()

  return function changeRole(row: TeamMemberRow, role: RoleRef, options: Options = {}) {
    const { undo = true, onError } = options
    if (!connection.isOnline()) {
      toast.error(OFFLINE_SAVE_ERROR)
      return
    }
    const previous = row.role
    const entityIds = currentEntityIds(row)
    const snapshot = queryClient.getQueryData<ListTeamOutput>(listKey)
    queryClient.setQueryData<ListTeamOutput>(listKey, (data) =>
      replaceRow(data, row.id, (r) => ({ ...r, role })),
    )

    client.members.updateAccess({ memberId: row.id, roleId: role.id, entityIds }).then(
      (result) => {
        queryClient.setQueryData<ListTeamOutput>(listKey, (data) =>
          replaceRow(data, row.id, () => result.row),
        )
        // Other pages and filters (a role filter, the Invited chip) catch up in the background.
        void queryClient.invalidateQueries({ queryKey: teamListKey(), refetchType: 'none' })
        const message = `${row.name} is now ${role.name}`
        if (!undo || previous.id === role.id) {
          toast.success(message)
          return
        }
        toast.success(message, {
          duration: UNDO_MS,
          action: {
            label: 'Undo',
            onClick: () => changeRole(result.row, previous, { undo: false, onError }),
          },
        })
      },
      (error: unknown) => {
        queryClient.setQueryData(listKey, snapshot)
        onError?.(error, row)
      },
    )
  }
}
