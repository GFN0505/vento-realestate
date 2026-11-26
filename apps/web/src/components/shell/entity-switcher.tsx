import { ChevronDownIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { entityNote } from '@/features/entity/current-entity'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { cn } from '@/lib/utils'

const ALL = 'all'

/**
 * Board ExecutiveHome: "ENTITY All entities ▾". A filter for the pages that use it; it never
 * grants access (decision 0014). One-entity members see a label without a menu.
 * `compact` is the phone header's small line under the organization name.
 */
export function EntitySwitcher({ compact = false }: { compact?: boolean }) {
  const current = useCurrentEntity()
  const label = current.entity?.name ?? 'All entities'

  const trigger = compact
    ? // A 44px touch area around a small line, without making the header taller.
      'relative -ml-1 inline-flex max-w-full items-center gap-1 rounded px-1 font-semibold text-muted-foreground text-xs after:absolute after:-inset-y-3 after:inset-x-0'
    : 'inline-flex h-9 min-w-0 max-w-[280px] items-center gap-2 rounded-lg border bg-background px-3 font-semibold text-[13px] text-foreground'

  const caption = compact ? (
    <span className="sr-only">Entity: </span>
  ) : (
    <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-[0.04em]">
      Entity
    </span>
  )

  if (current.status === 'pending' && !current.locked) {
    return compact ? (
      <Skeleton className="mt-1 h-3.5 w-24" />
    ) : (
      <Skeleton className="h-9 w-[168px] rounded-lg" />
    )
  }

  if (current.locked) {
    return (
      <span className={cn(trigger, 'after:hidden')} title={label}>
        {caption}
        <span className="truncate">{label}</span>
      </span>
    )
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && current.status === 'error' && current.refetch()}>
      <DropdownMenuTrigger
        className={cn(
          trigger,
          'outline-none transition-colors focus-visible:outline-2 focus-visible:outline-ring',
          !compact && 'hover:border-input-hover data-[state=open]:border-input-hover',
        )}
      >
        {caption}
        <span className="truncate" title={label}>
          {label}
        </span>
        <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(300px,calc(100vw-2rem))]">
        <DropdownMenuRadioGroup
          value={current.entity?.id ?? ALL}
          onValueChange={(value) => current.select(value === ALL ? null : value)}
        >
          <EntityRow value={ALL} name="All entities" note={null} />
          {current.options.map((entity) => (
            <EntityRow
              key={entity.id}
              value={entity.id}
              name={entity.name}
              note={entityNote(entity)}
            />
          ))}
        </DropdownMenuRadioGroup>
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
