import { CheckIcon, ChevronsUpDownIcon, LoaderCircleIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSwitchOrganization } from '@/features/organization/switch-organization'
import { useMe } from '@/features/preview/use-effective-permissions'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

/** The organization's square: initials on a brand tint (no logos until branding ships). */
function OrgAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent font-bold text-[11px] text-sidebar-accent-foreground tracking-wide"
    >
      {initials(name) || 'V'}
    </span>
  )
}

/**
 * The organization card under the lockup: avatar, name and your role there. People in two or
 * more organizations get a menu (switch in 2 clicks); for everyone else it's a plain card.
 * Collapsed, it's the avatar alone with a tooltip.
 */
export function OrganizationSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const me = useMe()
  const switchOrganization = useSwitchOrganization()
  const current = me.organization
  if (!current) return null
  const role = me.organizations.find((o) => o.id === current.id)?.roleName ?? me.member?.role.name
  const canSwitch = me.organizations.length > 1
  const pending = switchOrganization.isPending

  const card = cn(
    'flex w-full items-center gap-2 rounded-lg border border-sidebar-border/50 bg-sidebar-hover p-2 text-left text-sidebar-foreground',
    collapsed && 'justify-center border-transparent bg-transparent p-1',
  )
  const body = (
    <>
      <OrgAvatar name={current.name} />
      {!collapsed && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-[13px]" title={current.name}>
            {current.name}
          </span>
          {role && (
            <span className="truncate text-[11.5px] text-sidebar-muted-foreground">{role}</span>
          )}
        </span>
      )}
    </>
  )

  if (!canSwitch) {
    return collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={card} tabIndex={-1}>
            {body}
            <span className="sr-only">{current.name}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">{current.name}</TooltipContent>
      </Tooltip>
    ) : (
      <div className={card}>{body}</div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          card,
          'outline-none transition-colors hover:bg-sidebar-active focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-0 data-[state=open]:bg-sidebar-active',
        )}
      >
        {body}
        <span className="sr-only">{collapsed ? current.name : ''}, switch organization</span>
        {!collapsed &&
          (pending ? (
            <LoaderCircleIcon
              aria-hidden
              className="size-4 shrink-0 animate-spin text-sidebar-faint-foreground"
            />
          ) : (
            <ChevronsUpDownIcon
              aria-hidden
              className="size-3.5 shrink-0 text-sidebar-faint-foreground"
            />
          ))}
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
