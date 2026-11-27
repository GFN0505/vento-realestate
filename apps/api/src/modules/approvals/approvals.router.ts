import { serviceContext } from '@/access/service-context'
import { runAfterCommit } from '@/approvals/after-commit'
import { cancelRequest, decide } from '@/approvals/engine'
import { approvalPlugins } from '@/approvals/registry'
import { member } from '@/orpc'
import { getApproval, listApprovals, previewApproval } from './approvals.service'

// Built on `member`, so the tab guard and two-step gate hold. No module permission: each
// procedure filters to rows the viewer may see, and decide checks eligibility under a lock
// (plan §5). Preview needs the action's own permission, which depends on the input, so the
// service checks it.
export const approvalsRouter = {
  list: member.approvals.list.handler(({ context, input }) =>
    listApprovals(serviceContext(context), input),
  ),
  get: member.approvals.get.handler(({ context, input }) =>
    getApproval(serviceContext(context), input.id),
  ),
  decide: member.approvals.decide.handler(async ({ context, input }) => {
    const result = await decide(serviceContext(context), input, approvalPlugins())
    await runAfterCommit(context, context.organizationId, result)
    return { notice: result.notice, ran: result.ran }
  }),
  cancel: member.approvals.cancel.handler(({ context, input }) =>
    cancelRequest(serviceContext(context), input.id),
  ),
  preview: member.approvals.preview.handler(({ context, input }) =>
    previewApproval(serviceContext(context), input),
  ),
}
