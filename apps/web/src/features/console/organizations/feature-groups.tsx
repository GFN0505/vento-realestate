import type { FeatureWhy } from '@vento/shared/console'
import { EllipsisIcon } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { groupOf, moduleLabel } from '../words'
import { useOrganizationSearch } from './use-organization-search'

/** Plain names for the two kinds of feature override (ux-writing: no system words). */
export const OVERRIDE_ACTIONS = {
  release: 'Give early access',
  feature: 'Add to or remove from their plan',
} as const

/**
 * One section per module, headed with how much of it is available ("Sales · 4 of 6"), so a
 * long catalog scans quickly. Counts come from the whole module, not just the filtered rows.
 */
export function FeatureGroups({
  groups,
  all,
}: {
  groups: readonly { module: string; rows: FeatureWhy[] }[]
  all: readonly FeatureWhy[]
}) {
  const { openChange } = useOrganizationSearch()
  return groups.map((group) => {
    const inModule = all.filter((f) => groupOf(f.key, f.module) === group.module)
    const available = inModule.filter((f) => f.available).length
    const label = moduleLabel(group.module)
    return (
      <section key={group.module} aria-label={label} className="pt-2 pb-1">
        <h3 className="flex items-baseline gap-2 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
          {label}
          <span className="font-medium normal-case tracking-normal tabular-nums">
            {available} of {inModule.length} available
          </span>
        </h3>
        <ul>
          {group.rows.map((row) => (
            <li
              key={row.key}
              data-testid="feature-why"
              className="flex items-start gap-3 border-t py-2 first:border-t-0"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[13px]">{row.label}</span>
                  <StatusBadge tone={row.available ? 'emerald' : 'slate'}>
                    {row.available ? 'Available' : 'Not available'}
                  </StatusBadge>
                </span>
                <span className="text-[13px] text-muted-foreground">{row.reason}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Overrides for ${row.label}`}
                    className="size-8 max-md:size-11"
                  >
                    <EllipsisIcon aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => openChange('override', { kind: 'release', key: row.key })}
                  >
                    {OVERRIDE_ACTIONS.release}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => openChange('override', { kind: 'feature', key: row.key })}
                  >
                    {OVERRIDE_ACTIONS.feature}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </section>
    )
  })
}
