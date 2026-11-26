import type { InvitationDelivery } from '@vento/shared'
import { and, eq } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { invitations } from '@/db/schema'
import { type EmailMessage, type Mailer, type SendResult, sendAll } from '@/email/mailer'
import { errorSummary } from '@/lib/error-summary'
import { logger } from '@/lib/logger'

export type Delivered = { delivery: InvitationDelivery; deliveryChangedAt: string }

/** `sent` with the provider's id; anything else (failed, skipped on staging) reads as failed. */
function deliveryOf(result: SendResult): {
  delivery: InvitationDelivery
  messageId: string | null
} {
  return result.status === 'sent'
    ? { delivery: 'sent', messageId: result.messageId }
    : { delivery: 'failed', messageId: null }
}

/**
 * Writes what the mailer reported onto the invitation. A delivery fact, not a change by a
 * person, so it isn't audited. Only the send that queued it can settle it: the row must still be
 * pending, still queued (settled once) and still on this send's time (a later resend owns the row
 * now). A bounce can't arrive first: the webhook matches on `deliveryMessageId`, which this write
 * is what stores. Never touches another organization's row.
 */
export async function recordDelivery(
  db: DbOrTx,
  input: { organizationId: string; invitationId: string; sentAt: Date; result: SendResult },
  now = new Date(),
): Promise<Delivered | null> {
  const { delivery, messageId } = deliveryOf(input.result)
  const [row] = await db
    .update(invitations)
    .set({ delivery, deliveryMessageId: messageId, deliveryChangedAt: now })
    .where(
      and(
        eq(invitations.organizationId, input.organizationId),
        eq(invitations.id, input.invitationId),
        eq(invitations.status, 'pending'),
        eq(invitations.delivery, 'queued'),
        eq(invitations.lastSentAt, input.sentAt),
      ),
    )
    .returning({ id: invitations.id })
  return row ? { delivery, deliveryChangedAt: now.toISOString() } : null
}

/**
 * Sends invitation emails after commit and records each one's delivery. Never throws: the
 * invitations exist whatever happens here, and the Team page offers Resend.
 */
export async function deliverInvitations(
  context: { db: DbOrTx; mailer: Mailer; organizationId: string; requestId?: string },
  messages: readonly EmailMessage[],
  sentAt: Date,
): Promise<Map<string, Delivered>> {
  const results = await sendAll(context.mailer, messages)
  const delivered = new Map<string, Delivered>()
  for (const [i, message] of messages.entries()) {
    const invitationId = message.metadata?.invitationId
    const result = results[i]
    if (!invitationId || !result) continue
    try {
      const recorded = await recordDelivery(context.db, {
        organizationId: context.organizationId,
        invitationId,
        sentAt,
        result,
      })
      if (recorded) delivered.set(invitationId, recorded)
    } catch (error) {
      logger.error('Invitation delivery not recorded', {
        requestId: context.requestId,
        ...errorSummary(error),
      })
    }
  }
  return delivered
}
