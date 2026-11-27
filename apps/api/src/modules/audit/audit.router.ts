import { requireAllEntities, requirePermission } from '@/access/middleware'
import { notImplemented } from '@/lib/not-implemented'
import { member } from '@/orpc'

// STUB (brick 4, build-order step 7): audit-read.service replaces these handlers.
export const auditRouter = {
  list: member.audit.list
    .use(requirePermission('settings', 'edit', 'see the audit log'))
    .use(requireAllEntities())
    .handler(notImplemented),
  get: member.audit.get
    .use(requirePermission('settings', 'edit', 'see the audit log'))
    .use(requireAllEntities())
    .handler(notImplemented),
  export: member.audit.export
    .use(requirePermission('settings', 'edit', 'export the audit log'))
    .use(requireAllEntities())
    .handler(notImplemented),
}
