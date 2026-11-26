import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { effectiveAccessFrom } from '@/features/preview/use-effective-permissions'
import { ModuleForbiddenError } from './module-forbidden-error'
import { canView, isAvailable, type NavKey, navItem } from './nav'

export { ModuleForbiddenError }

/**
 * `beforeLoad` for a module's routes. It runs before any loader, so a member who can't open the
 * module never requests its data. A module the organization doesn't have is a 404 for every
 * role (to them it doesn't exist); one the role can't view is a 403 (decision 12).
 */
export function moduleGuard(key: NavKey) {
  const item = navItem(key)
  return ({ context }: { context: { queryClient: QueryClient } }) => {
    const access = effectiveAccessFrom(context.queryClient)
    if (!access || !isAvailable(access, item)) throw notFound()
    if (item.module && !canView(access, item)) throw new ModuleForbiddenError(item.module)
  }
}
