import { ORPCError } from '@orpc/client'
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query'
import type { ListTeamOutput, RoleRef, TeamMemberRow } from '@vento/shared'
import { toast } from 'sonner'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { apiErrorMessage } from '@/lib/api-errors'
import { errorReason } from '@/lib/error-data'
import { client } from '@/lib/orpc'
import { ENTITY_UNAVAILABLE } from './invite/use-send-invitations'
import { teamListKey } from './team-queries'
import { replaceRow } from './use-change-role'
import type { TeamActions } from './use-team-actions'

export type SaveAccess = { row: TeamMemberRow; role: RoleRef; entityIds: string[] | null }

/**
 * The member sheet's Save changes. Success replaces the row and closes the sheet; a refusal keeps
 * the sheet and its choices and says why (an archived entity refreshes the tick list).
 */
export function useSaveAccess(listKey: QueryKey, actions: TeamActions, onSaved: () => void) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ row, role, entityIds }: SaveAccess) =>
      client.members.updateAccess({ memberId: row.id, roleId: role.id, entityIds }),
    onSuccess: (result, { row }) => {
      queryClient.setQueryData<ListTeamOutput>(listKey, (data) =>
        replaceRow(data, row.id, () => result.row),
      )
      void queryClient.invalidateQueries({ queryKey: teamListKey(), refetchType: 'none' })
      toast.success(`Access updated for ${row.name}`)
      onSaved()
    },
    onError: (error, { row }) => {
      if (error instanceof ORPCError && error.code === 'NOT_FOUND') {
        actions.failed(actions.memberGone(row))(error)
        onSaved()
      }
      if (errorReason(error) === 'entity_unavailable') {
        void queryClient.invalidateQueries({ queryKey: entitiesQuery().queryKey })
      }
    },
  })
  const error = mutation.error
  const errorText =
    !error || (error instanceof ORPCError && ['NOT_FOUND', 'UNAUTHORIZED'].includes(error.code))
      ? null
      : errorReason(error) === 'entity_unavailable'
        ? ENTITY_UNAVAILABLE
        : apiErrorMessage(error)
  return Object.assign(mutation, { errorText })
}
