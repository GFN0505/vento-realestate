import { entityLimit } from '@vento/shared'
import { z } from 'zod'
import type { ApprovalPlugin, ExecuteResult } from '@/approvals/plugin'
import { notFound } from '@/lib/errors'
import { applyMemberAccess, describeTarget } from './members.service'

// "Make someone an owner" (access.member.make_owner): changing a member's role to Owner. Applied
// by applyMemberAccess, the only writer of a member's role, with the new-owner alerts.

export const memberAccessPayload = z.object({
  memberId: z.uuid(),
  roleId: z.uuid(),
  entityIds: entityLimit,
})

export const makeOwnerPlugin: ApprovalPlugin<
  z.output<typeof memberAccessPayload>,
  ExecuteResult
> = {
  key: 'access.member.make_owner',
  permission: { module: 'settings', action: 'edit' },
  payload: memberAccessPayload,
  subject: (p) => ({ type: 'member', id: p.memberId }),
  async describe(tx, ctx, p) {
    const target = await describeTarget(tx, ctx.organizationId, p.memberId)
    if (!target) throw notFound()
    return {
      entityId: null,
      summary: {
        title: `Make ${target.name} an owner`,
        recordLabel: target.name,
        recordLink: '/settings/team',
        amount: null,
        changes: [{ field: 'Role', before: target.roleName, after: 'Owner' }],
      },
    }
  },
  async excluded(tx, ctx, p) {
    const target = await describeTarget(tx, ctx.organizationId, p.memberId)
    return target
      ? [
          {
            userId: target.userId,
            reason: "You're the person being made an owner, so another owner approves it.",
          },
        ]
      : []
  },
  execute: (tx, ctx, p, meta) => applyMemberAccess(tx, ctx, p, meta),
}
