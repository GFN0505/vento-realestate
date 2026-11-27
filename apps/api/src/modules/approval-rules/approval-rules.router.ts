import { requireAllEntities, requirePermission } from '@/access/middleware'
import { notImplemented } from '@/lib/not-implemented'
import { member } from '@/orpc'

// STUB (brick 4, build-order step 6): the rules service replaces these handlers, and the
// writes gain `requireOwner()` ("Only owners can change approval rules.").
export const approvalRulesRouter = {
  list: member.approvalRules.list
    .use(requirePermission('settings', 'view', 'see approval rules'))
    .handler(notImplemented),
  create: member.approvalRules.create
    .use(requirePermission('settings', 'edit', 'change approval rules'))
    .use(requireAllEntities())
    .handler(notImplemented),
  update: member.approvalRules.update
    .use(requirePermission('settings', 'edit', 'change approval rules'))
    .use(requireAllEntities())
    .handler(notImplemented),
  delete: member.approvalRules.delete
    .use(requirePermission('settings', 'edit', 'change approval rules'))
    .use(requireAllEntities())
    .handler(notImplemented),
}
