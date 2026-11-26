import { useQuery } from '@tanstack/react-query'
import type { TeamMemberRow } from '@vento/shared'
import { ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { rolesQuery, useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { grantableRoles } from './role-notes'
import { useTeamActionsContext } from './use-team-actions'

/**
 * The role, changed in place (spec: 2 clicks). Only on rows the viewer can change; Owner is
 * offered to owners only, and asks first.
 */
export function RoleMenu({ row }: { row: TeamMemberRow }) {
  const actions = useTeamActionsContext()
  const access = useEffectiveAccess()
  const roles = useQuery(rolesQuery())
  const options = grantableRoles(roles.data?.items ?? [], access.roleKey === 'owner')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Role for ${row.name}: ${row.role.name}. Change role`}
        className="group/role -ml-2 inline-flex h-8 max-w-full items-center gap-1 rounded-md px-2 text-left text-[13px] outline-none transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted"
      >
        <span className="truncate">{row.role.name}</span>
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground/70 transition-[color,transform] duration-150 group-hover/role:translate-y-px group-hover/role:text-foreground group-data-[state=open]/role:text-foreground"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Role</DropdownMenuLabel>
        {roles.isPending && (
          <p className="px-2.5 py-2 text-muted-foreground text-xs">Loading roles…</p>
        )}
        <DropdownMenuRadioGroup
          value={row.role.id}
          onValueChange={(id) => {
            const role = options.find((r) => r.id === id)
            if (role) actions.changeRole(row, { id: role.id, key: role.key, name: role.name })
          }}
        >
          {options.map((role) => (
            <DropdownMenuRadioItem key={role.id} value={role.id}>
              {role.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
