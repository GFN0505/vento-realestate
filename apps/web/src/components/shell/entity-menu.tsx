import { PlusIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { type LazyMenuProps, useAutoFocus } from '@/components/ui/lazy-menu'
import { openAddCompany } from '@/features/companies/open-add-company'
import { entityNote } from '@/features/entity/current-entity'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { preloadCompanySheet } from '@/features/shell/shell-ui'
import {
  EntityTriggerContent,
  entityTriggerClass,
  switcherLabel,
  useCanAddCompany,
} from './entity-switcher'

const ALL = 'all'

/** The entity menu, loaded when the switcher is first approached (see EntitySwitcher). */
export function EntityMenu({
  compact,
  defaultOpen,
  autoFocus,
}: LazyMenuProps & { compact: boolean }) {
  const me = useMe()
  const { showUpgradeHints } = useEffectiveAccess()
  const current = useCurrentEntity()
  const canAdd = useCanAddCompany()
  const trigger = useAutoFocus<HTMLButtonElement>(autoFocus)
  const label = switcherLabel(current)
  // One company: its row (checked), then Add company. Otherwise "All" first.
  const single = current.locked || current.options.length <= 1

  return (
    <DropdownMenu
      defaultOpen={defaultOpen}
      onOpenChange={(open) => {
        if (open && current.status === 'error') current.refetch()
        if (open && canAdd) preloadCompanySheet()
      }}
    >
      <DropdownMenuTrigger ref={trigger} className={entityTriggerClass({ compact })}>
        <EntityTriggerContent
          compact={compact}
          organization={me.organization?.name ?? 'Vento'}
          label={label}
          menu
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(300px,calc(100vw-2rem))]">
        <DropdownMenuRadioGroup
          value={current.entity?.id ?? (single ? (current.options[0]?.id ?? ALL) : ALL)}
          onValueChange={(value) => current.select(value === ALL ? null : value)}
        >
          {!single && <EntityRow value={ALL} name="All entities" note={null} />}
          {current.options.map((entity) => (
            <EntityRow
              key={entity.id}
              value={entity.id}
              name={entity.name}
              note={entityNote(entity)}
            />
          ))}
        </DropdownMenuRadioGroup>
        {canAdd && (
          <>
            {current.options.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onSelect={() => openAddCompany(showUpgradeHints ? me.plan : null)}
              className="font-semibold text-link [&_svg]:text-link!"
            >
              <PlusIcon aria-hidden />
              Add company
            </DropdownMenuItem>
          </>
        )}
        {current.status === 'error' && (
          <p className="px-2.5 py-2 text-muted-foreground text-xs" role="status">
            Couldn't load your entities. Close and open this menu to try again.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EntityRow({ value, name, note }: { value: string; name: string; note: string | null }) {
  return (
    <DropdownMenuRadioItem value={value} className="gap-3 py-2">
      <span className="min-w-0 flex-1 truncate font-semibold" title={name}>
        {name}
      </span>
      {note && <span className="shrink-0 text-[11px] text-muted-foreground">{note}</span>}
    </DropdownMenuRadioItem>
  )
}
