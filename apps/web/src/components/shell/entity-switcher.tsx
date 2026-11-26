import { ChevronDownIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { LazyMenu, type LazyMenuProps } from '@/components/ui/lazy-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { useMe } from '@/features/preview/use-effective-permissions'
import { cn } from '@/lib/utils'

type Variant = { compact: boolean }

export const entityTriggerClass = ({ compact }: Variant) =>
  compact
    ? // Phones: the organization and the entity are one 44px button.
      '-mx-1.5 flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-lg px-1.5 text-left outline-none transition-colors active:bg-muted focus-visible:outline-2 focus-visible:outline-ring'
    : 'inline-flex h-9 min-w-0 max-w-[280px] items-center gap-2 rounded-lg border bg-background px-3 font-semibold text-[13px] text-foreground outline-none transition-colors hover:border-input-hover focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:border-input-hover'

/** What the trigger shows; shared by the plain button and the loaded menu's trigger. */
export function EntityTriggerContent({
  compact,
  organization,
  label,
  menu,
}: Variant & { organization: string; label: string; menu: boolean }) {
  if (compact) {
    return (
      <>
        <span
          className="max-w-full truncate font-heading font-semibold text-[17px] leading-snug"
          title={organization}
        >
          {organization}
        </span>
        <span className="flex max-w-full items-center gap-1 font-semibold text-muted-foreground text-xs">
          <span className="truncate" title={label}>
            {label}
          </span>
          {menu && <ChevronDownIcon aria-hidden className="size-3.5 shrink-0" />}
        </span>
        {menu && <span className="sr-only">, change entity</span>}
      </>
    )
  }
  return (
    <>
      <span className="font-bold text-[10px] text-muted-foreground uppercase tracking-[0.04em]">
        Entity
      </span>
      <span className="truncate" title={label}>
        {label}
      </span>
      {menu && <ChevronDownIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />}
    </>
  )
}

const loadMenu = (compact: boolean) => () =>
  import('./entity-menu').then(
    (m): ComponentType<LazyMenuProps> =>
      (props) => <m.EntityMenu {...props} compact={compact} />,
  )
const loaders = { compact: loadMenu(true), bar: loadMenu(false) }

/**
 * Board ExecutiveHome: "ENTITY All entities ▾". A filter for the pages that use it; it never
 * grants access (decision 0014). One-entity members see a label without a menu. On phones it
 * is the header's organization-and-entity block. The menu itself loads on first approach.
 */
export function EntitySwitcher({ compact = false }: { compact?: boolean }) {
  const me = useMe()
  const current = useCurrentEntity()
  const organization = me.organization?.name ?? 'Vento'
  const label = current.entity?.name ?? 'All entities'

  if (current.status === 'pending' && !current.locked) {
    return compact ? (
      <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
        <span className="truncate font-heading font-semibold text-[17px] leading-snug">
          {organization}
        </span>
        <Skeleton className="mt-1 h-3.5 w-24" />
      </div>
    ) : (
      <Skeleton className="h-9 w-[168px] rounded-lg" />
    )
  }

  if (current.locked) {
    return (
      <div className={cn(entityTriggerClass({ compact }), 'cursor-default active:bg-transparent')}>
        <EntityTriggerContent
          compact={compact}
          organization={organization}
          label={label}
          menu={false}
        />
      </div>
    )
  }

  return (
    <LazyMenu
      load={compact ? loaders.compact : loaders.bar}
      className={entityTriggerClass({ compact })}
    >
      <EntityTriggerContent compact={compact} organization={organization} label={label} menu />
    </LazyMenu>
  )
}
