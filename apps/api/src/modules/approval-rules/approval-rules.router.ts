import { APPROVAL_COPY } from '@vento/shared'
import { requireAllEntities, requireOwner, requirePermission } from '@/access/middleware'
import { serviceContext } from '@/access/service-context'
import { sendAll } from '@/email/mailer'
import { member } from '@/orpc'
import { createRule, deleteRule, listRules, updateRule } from './approval-rules.service'

// Owners with every company change rules; Settings viewers read them (spec open question 1).
// Every other owner is emailed about each change, after commit (plan question 4).
export const approvalRulesRouter = {
  list: member.approvalRules.list
    .use(requirePermission('settings', 'view', 'see approval rules'))
    .handler(({ context }) => listRules(serviceContext(context))),
  create: member.approvalRules.create
    .use(requirePermission('settings', 'edit', 'change approval rules'))
    .use(requireAllEntities())
    .use(requireOwner(APPROVAL_COPY.ownersOnly))
    .handler(async ({ context, input }) => {
      const { emails, ...result } = await createRule(serviceContext(context), input)
      await sendAll(context.mailer, emails)
      return result
    }),
  update: member.approvalRules.update
    .use(requirePermission('settings', 'edit', 'change approval rules'))
    .use(requireAllEntities())
    .use(requireOwner(APPROVAL_COPY.ownersOnly))
    .handler(async ({ context, input }) => {
      const { emails, ...result } = await updateRule(serviceContext(context), input)
      await sendAll(context.mailer, emails)
      return result
    }),
  delete: member.approvalRules.delete
    .use(requirePermission('settings', 'edit', 'change approval rules'))
    .use(requireAllEntities())
    .use(requireOwner(APPROVAL_COPY.ownersOnly))
    .handler(async ({ context, input }) => {
      const { emails, ...result } = await deleteRule(serviceContext(context), input.id)
      await sendAll(context.mailer, emails)
      return result
    }),
}
