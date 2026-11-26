import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { effectiveAccessFrom } from '@/features/preview/use-effective-permissions'
import { ModuleForbiddenError } from './module-forbidden-error'
import { canView, type NavKey, navItem } from './nav'

export { ModuleForbiddenError }

/**
 * `beforeLoad` for a module's routes. It runs before any loader, so a member who can't view the
 * module never requests its data. A hidden module is a 404 (the "one switch" in nav.ts).
 */
export function moduleGuard(key: NavKey) {
  const item = navItem(key)
  return ({ context }: { context: { queryClient: QueryClient } }) => {
    if (item.status === 'hidden') throw notFound()
    const access = effectiveAccessFrom(context.queryClient)
    if (item.module && !canView(access?.permissions ?? null, item)) {
      throw new ModuleForbiddenError(item.module)
    }
  }
}
