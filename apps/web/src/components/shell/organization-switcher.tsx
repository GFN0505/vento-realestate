import { CheckIcon, ChevronsUpDownIcon, LoaderCircleIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSwitchOrganization } from '@/features/organization/switch-organization'
import { useMe } from '@/features/preview/use-effective-permissions'
import { cn } from '@/lib/utils'

/**
 * The organization name under the lockup. People in two or more organizations get a menu
 * (switch in 2 clicks); everyone else sees a label.
 */
export function OrganizationSwitcher({ tone = 'sidebar' }: { tone?: 'sidebar' | 'surface' }) {
  const me = useMe()
  const switchOrganization = useSwitchOrganization()
  const current = me.organization
  if (!current) return null

  const name = (
    <span className="min-w-0 flex-1 truncate text-left" title={current.name}>
      {current.name}
    </span>
  )
  const base = cn(
    'flex min-h-9 w-full items-center gap-2 rounded-lg px-2.5 font-semibold text-[13px] max-lg:min-h-11',
    tone === 'sidebar' ? 'text-sidebar-foreground' : 'text-foreground',
  )

  if (me.organizations.length < 2) return <div className={base}>{name}</div>

  const pending = switchOrganization.isPending
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          base,
          'outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring',
          tone === 'sidebar'
            ? 'hover:bg-sidebar-hover data-[state=open]:bg-sidebar-hover'
            : 'border bg-background hover:bg-muted',
        )}
      >
        {name}
        <span className="sr-only">, switch organization</span>
        {pending ? (
          <LoaderCircleIcon aria-hidden className="size-4 shrink-0 animate-spin opacity-70" />
        ) : (
          <ChevronsUpDownIcon aria-hidden className="size-4 shrink-0 opacity-70" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[264px]">
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
              className="items-start py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-semibold">{org.name}</span>
                <span className="text-muted-foreground text-xs">{org.roleName}</span>
              </span>
              {isCurrent && (
                <CheckIcon aria-label="Current" className="mt-0.5 size-4 text-brand!" />
              )}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
