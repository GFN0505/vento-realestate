import { ORPCError } from '@orpc/client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { meQuery } from '@/features/account/api'
import { checklistQuery } from '@/features/checklist/checklist-queries'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { errorReason } from '@/lib/error-data'
import { client } from '@/lib/orpc'
import { teamListKey } from '../team-queries'
import { type InviteDraft, inviteDraft } from './use-invite-draft'

export const ENTITY_UNAVAILABLE =
  'One of the entities you chose is no longer available. Choose again.'

export type InviteErrors = { emails: string | null; role: string | null; entities: string | null }

export const NO_ERRORS: InviteErrors = { emails: null, role: null, entities: null }

/** Field errors before sending. Row problems (bad address, clashes, "That's you") are on rows. */
export function validateDraft(draft: InviteDraft): InviteErrors {
  return {
    emails: draft.rows.length === 0 ? 'Add at least one email' : null,
    role:
      draft.roleId === null && draft.rows.some((r) => r.roleId === null) ? 'Choose a role' : null,
    entities:
      draft.entityMode === 'some' && draft.entityIds.length === 0
        ? 'Choose at least one entity, or allow all'
        : null,
  }
}

function conflictLists(error: unknown) {
  if (!(error instanceof ORPCError) || error.code !== 'CONFLICT') return null
  const data: unknown = error.data
  if (typeof data !== 'object' || data === null) return null
  const members =
    'alreadyMembers' in data && Array.isArray(data.alreadyMembers) ? data.alreadyMembers : []
  const invited =
    'alreadyInvited' in data && Array.isArray(data.alreadyInvited) ? data.alreadyInvited : []
  return {
    members: members.filter((e): e is string => typeof e === 'string'),
    invited: invited.filter(
      (i): i is { email: string; id: string } =>
        typeof i === 'object' &&
        i !== null &&
        typeof i.email === 'string' &&
        typeof i.id === 'string',
    ),
  }
}

/** Sends the batch; on a refusal the rows stay and the exact problem is marked (spec). */
export function useSendInvitations(onSent: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (draft: InviteDraft) =>
      client.invitations.create({
        items: draft.rows.map((row) => ({
          email: row.email,
          // validateDraft guarantees a role for every row.
          roleId: row.roleId ?? draft.roleId ?? '',
        })),
        entityIds: draft.entityMode === 'all' ? null : [...draft.entityIds],
      }),
    onMutate: () => inviteDraft.setError(null),
    onSuccess: (result, draft) => {
      const first = draft.rows[0]
      toast.success(
        result.sent === 1 && first
          ? `Invitation sent to ${first.email}`
          : `Invitations sent to ${result.sent} people`,
      )
      // Places used (me.plan), the list and Home's "Invite your team" all change.
      void queryClient.invalidateQueries({ queryKey: teamListKey() })
      void queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
      void queryClient.invalidateQueries({ queryKey: checklistQuery().queryKey })
      onSent()
    },
    onError: (error) => {
      const lists = conflictLists(error)
      if (lists && (lists.members.length > 0 || lists.invited.length > 0)) {
        inviteDraft.markClashes(lists.members, lists.invited)
      }
      const reason = errorReason(error)
      if (
        reason === 'entity_unavailable' ||
        (error instanceof ORPCError && error.code === 'NOT_FOUND')
      ) {
        // An entity was archived (or a role deleted) meanwhile: refresh the choices.
        void queryClient.invalidateQueries({ queryKey: entitiesQuery().queryKey })
        void queryClient.invalidateQueries({ queryKey: rolesQuery().queryKey })
      }
      inviteDraft.setError(error)
    },
  })
}
