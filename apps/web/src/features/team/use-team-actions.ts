import { ORPCError } from '@orpc/client'
import { type QueryKey, useMutation, useQueryClient } from '@tanstack/react-query'
import type { RoleRef, TeamInvitationRow, TeamMemberRow } from '@vento/shared'
import { createContext, useContext, useState } from 'react'
import { toast } from 'sonner'
import { meQuery } from '@/features/account/api'
import { checklistQuery } from '@/features/checklist/checklist-queries'
import { toastApiError } from '@/lib/api-errors'
import { client } from '@/lib/orpc'
import { teamListKey } from './team-queries'
import { useChangeRole } from './use-change-role'

export type TeamConfirm =
  | { kind: 'remove'; row: TeamMemberRow }
  | { kind: 'reset'; row: TeamMemberRow }
  /** `save`: the member sheet's own save (role and entities together); else the role alone. */
  | { kind: 'owner'; row: TeamMemberRow; role: RoleRef; save?: () => void }

/**
 * Every change on the Team page, in one place so rows, menus, cards and sheets behave the same.
 * Someone else may have acted since the list loaded: a NOT_FOUND says so and refreshes the list.
 */
export function useTeamActions(listKey: QueryKey) {
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState<TeamConfirm | null>(null)
  const refresh = (extra = false) => {
    void queryClient.invalidateQueries({ queryKey: teamListKey() })
    // Places used (owners' usage line) and Home's checklist follow membership changes.
    if (extra) {
      void queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
      void queryClient.invalidateQueries({ queryKey: checklistQuery().queryKey })
    }
  }
  const failed = (who: string) => (error: unknown) => {
    if (error instanceof ORPCError && error.code === 'NOT_FOUND') {
      toast.error(`${who} The list is up to date.`)
      refresh(true)
      return
    }
    toastApiError(error)
  }
  const memberGone = (row: TeamMemberRow) => `${row.name} is no longer a member.`
  const invitationGone = (row: TeamInvitationRow) =>
    `The invitation to ${row.email} is no longer open.`

  const changeRoleNow = useChangeRole(listKey)

  const resend = useMutation({
    mutationFn: (row: TeamInvitationRow) => client.invitations.resend({ id: row.id }),
    onSuccess: (_, row) => {
      toast.success(`Invitation sent again to ${row.email}`)
      refresh(true)
    },
    onError: (error, row) => failed(invitationGone(row))(error),
  })
  const withdraw = useMutation({
    mutationFn: (row: TeamInvitationRow) => client.invitations.withdraw({ id: row.id }),
    onSuccess: (_, row) => {
      toast.success(`Invitation to ${row.email} withdrawn`)
      refresh(true)
    },
    onError: (error, row) => failed(invitationGone(row))(error),
  })
  const remove = useMutation({
    mutationFn: (row: TeamMemberRow) => client.members.remove({ memberId: row.id }),
    onSuccess: (_, row) => {
      setConfirm(null)
      toast.success(`${row.name} removed. History kept.`)
      refresh(true)
    },
    onError: (error, row) => {
      setConfirm(null)
      failed(memberGone(row))(error)
    },
  })
  const resetTwoStep = useMutation({
    mutationFn: (row: TeamMemberRow) => client.members.resetTwoStep({ memberId: row.id }),
    onSuccess: (_, row) => {
      setConfirm(null)
      toast.success(
        `Two-step reset for ${row.name}. We've emailed them a link to set a new password.`,
      )
      refresh()
    },
    onError: (error, row) => {
      setConfirm(null)
      failed(memberGone(row))(error)
    },
  })

  return {
    confirm,
    setConfirm,
    resend,
    withdraw,
    remove,
    resetTwoStep,
    /** From a row's role menu: saves at once with Undo, except Owner, which asks first. */
    changeRole(row: TeamMemberRow, role: RoleRef) {
      if (role.id === row.role.id) return
      if (role.key === 'owner') setConfirm({ kind: 'owner', row, role })
      else changeRoleNow(row, role, { onError: (error) => failed(memberGone(row))(error) })
    },
    makeOwner({ row, role, save }: Extract<TeamConfirm, { kind: 'owner' }>) {
      setConfirm(null)
      if (save) return save()
      changeRoleNow(row, role, { undo: false, onError: (error) => failed(memberGone(row))(error) })
    },
    copyEmail(email: string) {
      void navigator.clipboard.writeText(email).then(
        () => toast.success('Email copied'),
        () => toast.error("Couldn't copy. Select the email and copy it instead."),
      )
    },
    memberGone,
    failed,
  }
}

export type TeamActions = ReturnType<typeof useTeamActions>

export const TeamActionsContext = createContext<TeamActions | null>(null)

export function useTeamActionsContext(): TeamActions {
  const actions = useContext(TeamActionsContext)
  if (!actions) throw new Error('useTeamActionsContext outside the Team page')
  return actions
}
