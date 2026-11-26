import { VentoMark } from '@/components/vento-mark'
import { EntitySwitcher } from './entity-switcher'
import { NavSheet } from './nav-sheet'
import { SearchButton } from './search-button'
import { UserMenu } from './user-menu'

/**
 * Board ExecutiveHome top bar: entity, search, account. Tablets add the menu button for the
 * sidebar sheet. Phones get the ExecutiveHomeMobile header: mark, organization, entity, search.
 */
export function TopBar() {
  return (
    <header>
      <div className="flex h-(--topbar-height) items-center gap-2.5 border-b bg-card px-4 max-md:hidden lg:px-6">
        <NavSheet />
        <EntitySwitcher />
        <SearchButton variant="bar" />
        <div className="flex-1" />
        <div className="lg:hidden">
          <UserMenu variant="topbar" />
        </div>
      </div>
      <div className="flex items-center gap-3 border-b bg-card px-[18px] py-2 md:hidden">
        <VentoMark size={26} wordmark={false} />
        <EntitySwitcher compact />
        <SearchButton variant="icon" />
      </div>
    </header>
  )
}
