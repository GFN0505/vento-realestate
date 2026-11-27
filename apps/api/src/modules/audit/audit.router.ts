import { requireAllEntities, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { member } from '@/orpc'
import { exportAudit, getAudit, listAudit, listAuditPeople } from './audit-read.service'

// Settings edit plus access to every company (spec open question 1): sign-ins and changes across
// companies are in here. Organization-wide, so no company filter from the switcher.
export const auditRouter = {
  list: member.audit.list
    .use(requirePermission('settings', 'edit', 'see the audit log'))
    .use(requireAllEntities())
    .handler(({ context, input }) => listAudit(serviceContext(context), input)),
  get: member.audit.get
    .use(requirePermission('settings', 'edit', 'see the audit log'))
    .use(requireAllEntities())
    .handler(({ context, input }) => getAudit(serviceContext(context), input.id)),
  people: member.audit.people
    .use(requirePermission('settings', 'edit', 'see the audit log'))
    .use(requireAllEntities())
    .handler(({ context, input }) => listAuditPeople(serviceContext(context), input)),
  // oRPC sends a File as multipart form data; the web client hands it back as a File to save.
  export: member.audit.export
    .use(requirePermission('settings', 'edit', 'export the audit log'))
    .use(requireAllEntities())
    .handler(({ context, input }) => exportAudit(serviceContext(context), input)),
}
