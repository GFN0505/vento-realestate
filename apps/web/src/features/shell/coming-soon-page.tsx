import { Link } from '@tanstack/react-router'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { type NavKey, navItem } from './nav'
import { usePageTitle } from './use-page-title'

/**
 * A module that isn't built yet, at its real address so links and ⌘K keep working when it ships
 * (pattern: EmptyState). Only reached by roles that can view the module.
 */
export function ComingSoonPage({ navKey }: { navKey: NavKey }) {
  const item = navItem(navKey)
  usePageTitle(item.label, { module: item.module })
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={item.label} badge={<StatusBadge tone="slate">Coming soon</StatusBadge>} />
      <EmptyState
        icon={item.icon}
        action={
          <Button variant="outline" asChild className="max-md:h-11">
            <Link to="/">Back to home</Link>
          </Button>
        }
      >
        {item.comingSoon}
      </EmptyState>
    </div>
  )
}
