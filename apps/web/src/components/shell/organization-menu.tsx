import { CheckIcon, LoaderCircleIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type LazyMenuProps, useAutoFocus } from '@/components/ui/lazy-menu'
import { useSwitchOrganization } from '@/features/organization/switch-organization'
import { useMe } from '@/features/preview/use-effective-permissions'
import { initials } from '@/lib/format'
import { OrgCardContent, orgCardClass } from './organization-switcher'

/** The organization menu, loaded when the card is first approached (see OrganizationSwitcher). */
export function OrganizationMenu({
  collapsed,
  defaultOpen,
  autoFocus,
}: LazyMenuProps & { collapsed: boolean }) {
  const me = useMe()
  const switchOrganization = useSwitchOrganization()
  const trigger = useAutoFocus<HTMLButtonElement>(autoFocus)
  const current = me.organization
  const pending = switchOrganization.isPending
  if (!current) return null

  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger ref={trigger} className={orgCardClass(collapsed, true)}>
        <OrgCardContent
          collapsed={collapsed}
          switchable
          trailing={
            pending ? (
              <LoaderCircleIcon
                aria-hidden
                className="size-3.5 shrink-0 animate-spin text-sidebar-faint-foreground"
              />
            ) : undefined
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side={collapsed ? 'right' : 'bottom'}
        className="w-[264px]"
      >
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {me.organizations.map((org) => {
          const isCurrent = org.id === current.id
          return (
            <DropdownMenuItem
              key={org.id}
              disabled={pending}
              onSelect={() => {
                if (!isCurrent) switchOrganization.mutate({ organizationId: org.id })
              }}
              className="gap-2.5 py-2"
            >
              <span
                aria-hidden
                className="flex size-7 shrink-0 items-center justify-center rounded-md bg-selected font-bold text-[10px] text-selected-foreground"
              >
                {initials(org.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{org.name}</span>
                <span className="text-muted-foreground text-xs">{org.roleName}</span>
              </span>
              {isCurrent && <CheckIcon aria-label="Current" className="size-4 text-brand!" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
