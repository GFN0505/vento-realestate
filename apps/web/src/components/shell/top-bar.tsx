import { useMatches } from '@tanstack/react-router'
import { VentoMark } from '@/components/vento-mark'
import { useMe } from '@/features/preview/use-effective-permissions'
import { ApprovalsTopBarLink } from './approvals-count'
import { EntitySwitcher } from './entity-switcher'
import { NavSheet } from './nav-sheet'
import { SearchButton } from './search-button'
import { UserMenu } from './user-menu'

/**
 * Board ExecutiveHome top bar: entity, search, account. Tablets add the menu button for the
 * sidebar sheet. Phones get the ExecutiveHomeMobile header: mark, organization, entity, search.
 */
export function TopBar() {
  // Pages that don't follow the entity (route flag `orgWide`) hide the switcher.
  const organizationWide = useMatches({ select: (ms) => ms.some((m) => m.staticData?.orgWide) })
  const organization = useMe().organization?.name ?? ''
  return (
    <header>
      <div className="flex h-(--topbar-height) items-center gap-2.5 border-b bg-card px-4 max-md:hidden lg:px-6">
        <NavSheet />
        {!organizationWide && <EntitySwitcher />}
        <SearchButton variant="bar" />
        <div className="flex-1" />
        <ApprovalsTopBarLink />
        <div className="lg:hidden">
          <UserMenu variant="topbar" />
        </div>
      </div>
      <div className="flex items-center gap-3 border-b bg-card px-[18px] py-2 md:hidden">
        <VentoMark size={26} wordmark={false} />
        {organizationWide ? (
          <span
            className="min-w-0 flex-1 truncate font-heading font-semibold text-[17px] leading-snug"
            title={organization}
          >
            {organization}
          </span>
        ) : (
          <EntitySwitcher compact />
        )}
        <SearchButton variant="icon" />
      </div>
    </header>
  )
}
