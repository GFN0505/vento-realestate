import { notImplemented } from '@/lib/not-implemented'
import { member } from '@/orpc'

// STUB (brick 4, build-order steps 4–5): the contract is in place so the repo typechecks; the
// engine and its service replace these handlers. Built on `member`, so the tab guard and the
// anonymous refusal already hold. Each procedure filters to rows the viewer may see, so none
// needs a module permission (plan §5).
export const approvalsRouter = {
  list: member.approvals.list.handler(notImplemented),
  get: member.approvals.get.handler(notImplemented),
  decide: member.approvals.decide.handler(notImplemented),
  cancel: member.approvals.cancel.handler(notImplemented),
  preview: member.approvals.preview.handler(notImplemented),
}
