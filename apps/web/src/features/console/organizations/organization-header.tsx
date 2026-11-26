import type { OrganizationDetail } from '@vento/shared/console'
import { EllipsisIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { formatDate } from '@/lib/format'
import { BackLink } from '../ui/back-link'
import { GROUP_LABEL, planLabel } from '../words'
import { useOrganizationSearch } from './use-organization-search'

/** "Growth v2 · Standard group · owner Olumide Bankole (olumide@…) · customer since 3 Feb 2026". */
export function headerLine(org: OrganizationDetail): string {
  const owner = org.owner ? `owner ${org.owner.name} (${org.owner.email})` : 'no owner'
  return [
    planLabel(org.plan),
    `${GROUP_LABEL[org.releaseGroup]} group`,
    owner,
    `customer since ${formatDate(org.customerSince)}`,
  ].join(' · ')
}

/** Name, facts, **Change plan** and a ⋯ menu with every other change (spec). */
export function OrganizationHeader({ org }: { org: OrganizationDetail }) {
  const { openChange } = useOrganizationSearch()
  const ai = org.addOns.find((a) => a.key === 'ai')
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <BackLink to="/console">Organizations</BackLink>
        <h1
          tabIndex={-1}
          className="mt-1 font-heading font-semibold text-[22px] leading-tight tracking-[-0.02em] sm:text-2xl"
        >
          {org.name}
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] text-muted-foreground tabular-nums">
          {headerLine(org)}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button onClick={() => openChange('plan')} className="max-md:h-11 max-md:flex-1">
          {org.plan ? 'Change plan' : 'Choose a plan'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="More changes"
              className="max-md:size-11"
            >
              <EllipsisIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {org.trial ? (
              <DropdownMenuItem onSelect={() => openChange('end-trial')}>
                End trial
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => openChange('start-trial')}>
                Start trial
              </DropdownMenuItem>
            )}
            {ai ? (
              <>
                <DropdownMenuItem onSelect={() => openChange('ai-budget')}>
                  Change AI budget
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openChange('remove-ai')}>
                  Remove AI
                </DropdownMenuItem>
              </>
            ) : (
              <DropdownMenuItem onSelect={() => openChange('add-ai')}>Add AI</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => openChange('group')}>
              Change release group
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => openChange('override')}>
              Add override
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
