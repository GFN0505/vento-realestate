import type { TeamInvitationRow, TeamMemberRow } from '@vento/shared'
import {
  CopyIcon,
  EllipsisIcon,
  KeyRoundIcon,
  SendIcon,
  SlidersHorizontalIcon,
  UndoIcon,
  UserMinusIcon,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTeamActionsContext } from './use-team-actions'

const trigger =
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted data-[state=open]:text-foreground'

/** True when the row has anything to offer; rows that can't be changed show no menu (spec). */
export function hasMenu(row: TeamMemberRow | TeamInvitationRow): boolean {
  return row.kind === 'member'
    ? row.can.changeAccess || row.can.resetTwoStep || row.can.remove
    : row.can.resend || row.can.withdraw
}

type Props = {
  row: TeamMemberRow | TeamInvitationRow
  /** "Change access" opens the row's sheet. */
  onOpen: () => void
}

/** ⋯ on a row: only the actions this viewer may take (the server computes `can`). */
export function RowMenu({ row, onOpen }: Props) {
  const actions = useTeamActionsContext()
  if (!hasMenu(row)) return null
  const name = row.kind === 'member' ? row.name : row.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Actions for ${name}`} className={trigger}>
        <EllipsisIcon aria-hidden className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto max-w-80 min-w-56">
        {row.kind === 'member' ? (
          <>
            {row.can.changeAccess && (
              <DropdownMenuItem onSelect={onOpen}>
                <SlidersHorizontalIcon aria-hidden />
                Change access
              </DropdownMenuItem>
            )}
            {row.can.resetTwoStep && (
              <DropdownMenuItem onSelect={() => actions.setConfirm({ kind: 'reset', row })}>
                <KeyRoundIcon aria-hidden />
                Reset two-step
              </DropdownMenuItem>
            )}
            {row.can.remove && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-status-rose-fg [&_svg]:text-status-rose-fg!"
                  onSelect={() => actions.setConfirm({ kind: 'remove', row })}
                >
                  <UserMinusIcon aria-hidden />
                  Remove from team
                </DropdownMenuItem>
              </>
            )}
          </>
        ) : (
          <>
            {row.can.resend && (
              <DropdownMenuItem onSelect={() => actions.resend.mutate(row)}>
                <SendIcon aria-hidden />
                Resend
              </DropdownMenuItem>
            )}
            {row.can.withdraw && (
              <DropdownMenuItem onSelect={() => actions.withdraw.mutate(row)}>
                <UndoIcon aria-hidden />
                Withdraw
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => actions.copyEmail(row.email)}>
              <CopyIcon aria-hidden />
              Copy email
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
