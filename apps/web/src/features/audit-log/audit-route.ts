import type { QueryClient } from '@tanstack/react-query'
import { effectiveAccessFrom } from '@/features/preview/use-effective-permissions'
import { canSeeAuditLog } from '@/features/settings/sections'
import { ModuleForbiddenError } from '@/features/shell/module-forbidden-error'
import { moduleGuard } from '@/features/shell/module-route'

const settingsGuard = moduleGuard('settings')

/**
 * Settings view first (as every section), then Settings edit and every company: anyone else gets
 * the 403 before any request (spec: the page is 403 and the API refuses `audit.list`).
 */
export function auditGuard({ context }: { context: { queryClient: QueryClient } }) {
  settingsGuard({ context })
  const access = effectiveAccessFrom(context.queryClient)
  if (!access || !canSeeAuditLog(access)) throw new ModuleForbiddenError('settings')
}
