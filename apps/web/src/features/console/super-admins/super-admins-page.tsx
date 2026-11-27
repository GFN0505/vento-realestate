import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { UserPlusIcon } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import type { SuperAdminsSearch } from '@/routes/console/-search'
import { rememberOpener } from '../changes/focus'
import { useConsoleTitle } from '../shell/use-console-title'
import { ListError, ListSkeleton } from '../ui/list-states'
import { plural } from '../words'
import { InvitationsSection } from './invitations-section'
import { InviteSheet } from './invite-sheet'
import { invitationsQuery, superAdminsQuery } from './queries'
import {
  RemoveSuperAdminDialog,
  ResetTwoStepDialog,
  WithdrawInvitationDialog,
} from './super-admin-changes'
import { SuperAdminsTable } from './super-admins-table'

const SECOND_APPROVER_FROM = 4

/**
 * Super-admins (pattern: list page; spec 1b): who can use the console, open invitations, and the
 * row actions (Reset two-step, Remove). Open sheets and confirms live in the address.
 */
export function SuperAdminsPage() {
  useConsoleTitle('Super-admins')
  const phone = useMediaQuery(PHONE_QUERY)
  const search = useSearch({ from: '/console/super-admins' })
  const navigate = useNavigate()
  const list = useQuery(superAdminsQuery())
  const invitations = useQuery(invitationsQuery())
  const rows = list.data
  const go = (next: SuperAdminsSearch, replace = false) => {
    if (!replace) rememberOpener()
    void navigate({ to: '/console/super-admins', search: next, replace })
  }
  const close = () => go({}, true)
  const other = (userId: string | undefined) =>
    userId ? rows?.find((r) => r.userId === userId && !r.isYou) : undefined
  const removing = other(search.remove)
  const resetting = search.reset
    ? rows?.find((r) => r.userId === search.reset && r.canResetTwoStep)
    : undefined
  const withdrawing = search.withdraw
    ? invitations.data?.find((i) => i.id === search.withdraw)
    : undefined
  const total = (rows?.length ?? 0) + (invitations.data?.length ?? 0)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Super-admins"
        description={rows ? plural(rows.length, 'super-admin') : ' '}
        actions={
          <Button onClick={() => go({ invite: true })} className="max-md:h-11">
            <UserPlusIcon aria-hidden />
            Invite super-admin
          </Button>
        }
      />
      {list.isError && !rows ? (
        <ListError
          what="Super-admins"
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : !rows ? (
        <ListSkeleton phone={phone} rows={3} />
      ) : (
        <SuperAdminsTable
          rows={rows}
          onRemove={(row) => go({ remove: row.userId })}
          onReset={(row) => go({ reset: row.userId })}
        />
      )}
      <InvitationsSection onWithdraw={(id) => go({ withdraw: id })} />
      {rows && total < SECOND_APPROVER_FROM && (
        <p className="text-[13px] text-muted-foreground">
          No second approver is needed while there are fewer than 4 super-admins.
        </p>
      )}
      {search.invite && <InviteSheet onClose={close} />}
      {removing && <RemoveSuperAdminDialog row={removing} onClose={close} />}
      {resetting && <ResetTwoStepDialog row={resetting} onClose={close} />}
      {withdrawing && <WithdrawInvitationDialog invitation={withdrawing} onClose={close} />}
    </div>
  )
}
