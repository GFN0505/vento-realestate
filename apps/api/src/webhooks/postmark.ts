import { createHash, timingSafeEqual } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { z } from 'zod'
import type { DbOrTx } from '@/db/client'
import { invitations } from '@/db/schema'
import { logger } from '@/lib/logger'
import type { RateLimiter } from '@/lib/rate-limit'
import { requestScope } from '@/lib/request-scope'

export const POSTMARK_WEBHOOK_USER = 'postmark'
/**
 * Wrong-credential attempts a minute per IP. Only failures count: Postmark's own (authenticated)
 * calls are never limited, so nobody without the secret can use up its allowance.
 */
const FAILED_ATTEMPTS_PER_MINUTE = 30

/**
 * The fields we read from Postmark's bounce and spam-complaint webhooks. Lenient: Postmark adds
 * fields over time, and the body also carries the address, which is never read, logged or kept.
 */
const payload = z.object({
  RecordType: z.string().optional(),
  Type: z.string().optional(),
  TypeCode: z.number().optional(),
  MessageID: z.string().optional(),
  Metadata: z.record(z.string(), z.unknown()).nullish(),
  Tag: z.string().nullish(),
  Inactive: z.boolean().optional(),
  BouncedAt: z.string().optional(),
})
export type PostmarkEvent = z.infer<typeof payload>

const HARD_BOUNCES = new Set(['HardBounce', 'BadEmailAddress'])
const invitationId = z.uuid()

/** What this event means for an invitation, or null when it's only counted in the logs. */
export function deliveryState(event: PostmarkEvent): 'bounced' | 'complained' | null {
  if (event.RecordType === 'SpamComplaint') return 'complained'
  if (event.RecordType !== 'Bounce') return null
  return HARD_BOUNCES.has(event.Type ?? '') || event.Inactive === true ? 'bounced' : null
}

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * HTTP Basic credentials (`postmark` and the secret), compared in constant time. Postmark doesn't
 * sign webhooks; its documentation recommends Basic auth over HTTPS.
 */
export function hasValidCredentials(header: string | undefined, secret: string): boolean {
  const encoded = header?.match(/^Basic\s+(\S+)$/i)?.[1]
  const given = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : ''
  // Equal-length digests, so neither the length nor the content leaks through timing.
  return timingSafeEqual(digest(given), digest(`${POSTMARK_WEBHOOK_USER}:${secret}`))
}

type MarkedState = 'bounced' | 'complained'

/**
 * The states an event may replace. A complaint outranks a bounce (the person actively objected,
 * and Postmark has suppressed the address either way), so a later or replayed bounce never hides
 * a complaint. Neither state replaces itself: a replay writes nothing, and `deliveryChangedAt`
 * keeps the time of the first event.
 */
const REPLACES: Record<MarkedState, ('sent' | 'bounced')[]> = {
  bounced: ['sent'],
  complained: ['sent', 'bounced'],
}

/**
 * Marks a pending invitation whose latest send this event is about. Matching on the message id
 * too means a stale bounce (for a send before a resend) changes nothing. Idempotent.
 *
 * Deliberately not filtered by `organizationId` (an exception to the isolation rule): a webhook
 * has no auth context. The row is found only by our invitation UUID (from the message metadata)
 * together with Postmark's MessageID for that exact send, which a caller can't guess, and the
 * request must carry the webhook secret.
 */
async function markInvitation(
  db: DbOrTx,
  id: string,
  messageId: string,
  state: MarkedState,
): Promise<boolean> {
  const rows = await db
    .update(invitations)
    .set({ delivery: state, deliveryChangedAt: new Date() })
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.deliveryMessageId, messageId),
        eq(invitations.status, 'pending'),
        inArray(invitations.delivery, REPLACES[state]),
      ),
    )
    .returning({ id: invitations.id })
  return rows.length > 0
}

/**
 * `POST /bounce`, mounted at `/webhooks/postmark` only when Postmark is the transport. Writes the
 * delivery state only; no audit event (a fact, not a person's change) and no personal data in
 * logs. Unknown, stale or non-invitation events still get 200 so Postmark stops retrying.
 */
export function postmarkWebhook(deps: {
  db: DbOrTx
  secret: string
  rateLimiter: RateLimiter
}): Hono {
  const app = new Hono()
  app.post('/bounce', bodyLimit({ maxSize: 64 * 1024 }), async (c) => {
    if (!hasValidCredentials(c.req.header('authorization'), deps.secret)) {
      const ip = requestScope().ip ?? 'unknown'
      const wait = deps.rateLimiter.hit(`postmark-webhook-failed:${ip}`, FAILED_ATTEMPTS_PER_MINUTE)
      if (wait > 0) {
        c.header('Retry-After', String(wait))
        return c.text('Too many requests', 429)
      }
      logger.warn('Postmark webhook refused: bad credentials', {
        requestId: requestScope().requestId,
      })
      c.header('WWW-Authenticate', 'Basic realm="webhooks"')
      return c.text('Unauthorized', 401)
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.text('Invalid JSON', 400)
    }
    const parsed = payload.safeParse(body)
    const event: PostmarkEvent = parsed.success ? parsed.data : {}
    const state = deliveryState(event)
    const id = invitationId.safeParse(event.Metadata?.invitationId)
    const matched =
      state !== null && id.success && event.MessageID
        ? await markInvitation(deps.db, id.data, event.MessageID, state)
        : false
    logger.info('Postmark webhook', {
      requestId: requestScope().requestId,
      recordType: event.RecordType,
      type: event.Type,
      tag: event.Tag,
      outcome: matched ? state : 'ignored',
    })
    return c.json({ ok: true })
  })
  return app
}
