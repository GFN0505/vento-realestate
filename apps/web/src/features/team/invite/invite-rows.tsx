import type { Role } from '@vento/shared'
import { CircleAlertIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { type InviteRow, inviteDraft } from './use-invite-draft'

type Props = {
  rows: readonly InviteRow[]
  roles: readonly Role[]
  /** The role chosen for everyone; a row follows it until given its own. */
  batchRoleId: string | null
  viewerEmail: string
  onResendInstead: (row: InviteRow, invitationId: string) => void
  resending: string | null
}

/** What's wrong with a row, or null. Shown on the row itself, never in a banner (spec). */
export function rowProblem(row: InviteRow, viewerEmail: string): string | null {
  if (!row.valid) return 'Check this email'
  if (row.email === viewerEmail.toLowerCase()) return "That's you"
  if (row.clash?.kind === 'member') return 'Already a member'
  if (row.clash?.kind === 'invited') return 'Already invited'
  return null
}

export function InviteRows({ rows, roles, batchRoleId, viewerEmail, ...actions }: Props) {
  if (rows.length === 0) return null
  return (
    <ul aria-label="People to invite" className="flex flex-col divide-y rounded-lg border bg-card">
      {rows.map((row) => {
        const problem = rowProblem(row, viewerEmail)
        const clash = row.clash
        return (
          <li
            key={row.email}
            data-invite-row={row.email}
            data-problem={problem ? true : undefined}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5 pr-1 pl-3 motion-safe:animate-in motion-safe:fade-in-0"
          >
            <div className="flex min-w-0 flex-1 basis-48 flex-col">
              <span
                className={cn('truncate text-sm', problem && 'text-status-rose-fg')}
                title={row.email}
              >
                {row.email}
              </span>
              {(problem || row.suggestion) && (
                <span className="flex flex-wrap items-center gap-x-2 text-xs">
                  {problem && (
                    <span className="inline-flex items-center gap-1 text-status-rose-fg">
                      <CircleAlertIcon aria-hidden className="size-3.5" />
                      {problem}
                    </span>
                  )}
                  {!problem && row.suggestion && (
                    <button
                      type="button"
                      className="rounded-sm text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() =>
                        row.suggestion && inviteDraft.replace(row.email, row.suggestion)
                      }
                    >
                      Did you mean {row.suggestion}?
                    </button>
                  )}
                  {clash?.kind === 'invited' && (
                    <Button
                      variant="link"
                      className="h-auto text-xs"
                      disabled={actions.resending === row.email}
                      onClick={() => actions.onResendInstead(row, clash.invitationId)}
                    >
                      Resend instead
                    </Button>
                  )}
                </span>
              )}
            </div>
            <RowRole row={row} roles={roles} batchRoleId={batchRoleId} />
            <button
              type="button"
              aria-label={`Remove ${row.email}`}
              onClick={() => inviteDraft.remove(row.email)}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:size-11"
            >
              <XIcon aria-hidden className="size-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** A row's own role: quiet until someone changes it, then it stays put when the batch role does. */
function RowRole({
  row,
  roles,
  batchRoleId,
}: {
  row: InviteRow
  roles: readonly Role[]
  batchRoleId: string | null
}) {
  const value = row.roleId ?? batchRoleId
  if (!value) return null
  return (
    <Select value={value} onValueChange={(roleId) => inviteDraft.setRowRole(row.email, roleId)}>
      <SelectTrigger
        aria-label={`Role for ${row.email}`}
        className={cn(
          'h-9 w-auto max-w-40 gap-1 border-transparent bg-transparent px-2 text-[13px] hover:bg-muted md:h-8',
          row.roleId ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.id}>
            {role.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
