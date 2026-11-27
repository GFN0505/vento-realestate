import type { QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { effectiveAccessFrom } from '@/features/preview/use-effective-permissions'
import { canView, navItem } from '@/features/shell/nav'

/**
 * `beforeLoad` for the inbox: like a module the organization doesn't have, Approvals is a 404
 * to people who neither approve nor asked lately (it appears nowhere for them). The server
 * filters every row regardless.
 */
export function approvalsGuard({ context }: { context: { queryClient: QueryClient } }) {
  const access = effectiveAccessFrom(context.queryClient)
  if (!access || !canView(access, navItem('approvals'))) throw notFound()
}
