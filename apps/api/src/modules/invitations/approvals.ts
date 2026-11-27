import { createHash } from 'node:crypto'
import { entityLimit } from '@vento/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { ApprovalPlugin, ExecuteResult } from '@/approvals/plugin'
import { entities } from '@/db/schema'
import { deliverInvitations } from './delivery'
import { createApprovedOwnerInvitation, type OwnerInvitationPayload } from './invitations.service'

// "Invite someone as an owner" (access.invitation.owner). Covered by the "Make someone an owner"
// rules (catalog `rulesFrom`), so inviting can't dodge them. Nothing exists while it waits: the
// invitation is created and emailed on approval.

export const ownerInvitationPayload = z.object({
  email: z.string().min(3).max(254),
  roleId: z.uuid(),
  entityIds: entityLimit,
  /** Resending this owner invitation (security M2): on approval it's revived, not re-created. */
  resendOf: z.uuid().optional(),
})

/**
 * The subject of an owner invitation is the email, which isn't a record yet: a stable uuid-shaped
 * digest of it, so one email has at most one pending owner invitation request.
 */
export function invitationEmailSubjectId(email: string): string {
  const hex = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export type OwnerInvitationResult = ExecuteResult & {
  invitationId: string
  message: ExecuteResult['emails'][number]
  /** The invitation's `lastSentAt`, which its delivery must match. */
  sentAt: Date
}

export const ownerInvitationPlugin: ApprovalPlugin<OwnerInvitationPayload, OwnerInvitationResult> =
  {
    key: 'access.invitation.owner',
    permission: { module: 'settings', action: 'create' },
    payload: ownerInvitationPayload,
    subject: (p) => ({ type: 'invitation_email', id: invitationEmailSubjectId(p.email) }),
    async describe(tx, ctx, p) {
      const names =
        p.entityIds === null
          ? 'All companies'
          : (
              await tx
                .select({ name: entities.name })
                .from(entities)
                .where(
                  and(
                    eq(entities.organizationId, ctx.organizationId),
                    inArray(entities.id, p.entityIds),
                  ),
                )
                .orderBy(entities.name)
            )
              .map((e) => e.name)
              .join(', ')
      return {
        entityId: null,
        summary: {
          title: `Invite ${p.email} as an owner`,
          recordLabel: p.email,
          recordLink: '/settings/team',
          amount: null,
          changes: [
            { field: 'Email', before: null, after: p.email },
            { field: 'Role', before: null, after: 'Owner' },
            { field: 'Companies', before: null, after: names },
          ],
        },
      }
    },
    excluded: async () => [],
    async execute(tx, ctx, p, meta) {
      const made = await createApprovedOwnerInvitation(tx, ctx, p, meta)
      return {
        notice: made.notice,
        invitationId: made.invitationId,
        message: made.message,
        sentAt: made.sentAt,
        // Sent and recorded after commit, like any invitation (Team shows its delivery).
        emails: [],
        afterCommit: async (deps) => {
          await deliverInvitations(deps, [made.message], made.sentAt)
        },
      }
    },
  }
