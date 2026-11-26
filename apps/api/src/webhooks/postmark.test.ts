import { createRouterClient } from '@orpc/server'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { invitations } from '@/db/schema'
import { createPostmarkTransport } from '@/email/transports/postmark'
import { logger } from '@/lib/logger'
import { createRateLimiter } from '@/lib/rate-limit'
import { router } from '@/router'
import { uniqueEmail, withRollback } from '@/test/db'
import { createInvitation, createOrganization } from '@/test/factories'
import { testContext } from '@/test/router-client'
import { postmarkWebhook } from './postmark'

const SECRET = 'webhook-secret-for-tests-only-0123456789'
const basic = (user: string, password: string) =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`

function webhook(db: DbOrTx, limiter = createRateLimiter(false)) {
  const app = postmarkWebhook({ db, secret: SECRET, rateLimiter: limiter })
  return (body: unknown, authorization = basic('postmark', SECRET)) =>
    app.request('/bounce', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}

const bounce = (invitationId: string, messageId: string, extra: Record<string, unknown> = {}) => ({
  RecordType: 'Bounce',
  Type: 'HardBounce',
  TypeCode: 1,
  MessageID: messageId,
  Metadata: { invitationId },
  Tag: 'invitation',
  Email: 'aisha@ventohomes.ng',
  Inactive: true,
  BouncedAt: '2026-11-26T10:30:00Z',
  ...extra,
})

/** A pending invitation whose latest send Postmark knows as `messageId`. */
async function sentInvitation(tx: DbOrTx, messageId: string) {
  const org = await createOrganization(tx)
  const { invitation } = await createInvitation(tx, org, { role: 'sales' })
  await tx
    .update(invitations)
    .set({ deliveryMessageId: messageId })
    .where(eq(invitations.id, invitation.id))
  return { org, invitation }
}

async function deliveryOf(tx: DbOrTx, id: string) {
  const [row] = await tx
    .select({ delivery: invitations.delivery })
    .from(invitations)
    .where(eq(invitations.id, id))
  return row?.delivery
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the Postmark bounce webhook', () => {
  it('refuses wrong or missing credentials with 401 and changes nothing', () =>
    withRollback(async (tx) => {
      vi.spyOn(logger, 'warn').mockImplementation(() => {})
      const { invitation } = await sentInvitation(tx, 'pm-1')
      const post = webhook(tx)
      expect((await post(bounce(invitation.id, 'pm-1'), basic('postmark', 'guess'))).status).toBe(
        401,
      )
      expect((await post(bounce(invitation.id, 'pm-1'), basic('other', SECRET))).status).toBe(401)
      expect((await post(bounce(invitation.id, 'pm-1'), '')).status).toBe(401)
      expect(await deliveryOf(tx, invitation.id)).toBe('sent')
    }))

  it('marks a hard bounce, and a retry of it is harmless', () =>
    withRollback(async (tx) => {
      const { invitation } = await sentInvitation(tx, 'pm-2')
      const post = webhook(tx)
      expect((await post(bounce(invitation.id, 'pm-2'))).status).toBe(200)
      expect((await post(bounce(invitation.id, 'pm-2'))).status).toBe(200)
      expect(await deliveryOf(tx, invitation.id)).toBe('bounced')
    }))

  it('marks a spam complaint', () =>
    withRollback(async (tx) => {
      const { invitation } = await sentInvitation(tx, 'pm-3')
      const complaint = bounce(invitation.id, 'pm-3', {
        RecordType: 'SpamComplaint',
        Type: 'SpamComplaint',
      })
      expect((await webhook(tx)(complaint)).status).toBe(200)
      expect(await deliveryOf(tx, invitation.id)).toBe('complained')
    }))

  it('ignores a bounce for an older send, a soft bounce and an answered invitation', () =>
    withRollback(async (tx) => {
      const { org, invitation } = await sentInvitation(tx, 'pm-new')
      const post = webhook(tx)
      expect((await post(bounce(invitation.id, 'pm-old'))).status).toBe(200)
      const soft = bounce(invitation.id, 'pm-new', { Type: 'SoftBounce', Inactive: false })
      expect((await post(soft)).status).toBe(200)
      expect(await deliveryOf(tx, invitation.id)).toBe('sent')

      const { invitation: accepted } = await createInvitation(tx, org, {
        role: 'sales',
        status: 'accepted',
      })
      await tx
        .update(invitations)
        .set({ deliveryMessageId: 'pm-4' })
        .where(eq(invitations.id, accepted.id))
      expect((await post(bounce(accepted.id, 'pm-4'))).status).toBe(200)
      expect(await deliveryOf(tx, accepted.id)).toBe('sent')
    }))

  it('answers 200 to unknown ids and events without one, and 400 to broken JSON', () =>
    withRollback(async (tx) => {
      const post = webhook(tx)
      const unknown = bounce('01936f1e-8b2a-7c3d-9e4f-00000000dead', 'pm-5')
      expect((await post(unknown)).status).toBe(200)
      expect((await post({ RecordType: 'Delivery', MessageID: 'pm-5' })).status).toBe(200)
      expect((await post(bounce('not-a-uuid', 'pm-5'))).status).toBe(200)
      expect((await post('{not json')).status).toBe(400)
    }))

  it("leaves another organization's invitations alone", () =>
    withRollback(async (tx) => {
      const mine = await sentInvitation(tx, 'pm-6')
      const theirs = await sentInvitation(tx, 'pm-7')
      await webhook(tx)(bounce(mine.invitation.id, 'pm-6'))
      expect(await deliveryOf(tx, theirs.invitation.id)).toBe('sent')
      // Their message id on my invitation id matches nothing.
      await webhook(tx)(bounce(theirs.invitation.id, 'pm-6'))
      expect(await deliveryOf(tx, theirs.invitation.id)).toBe('sent')
    }))

  it('rate-limits to 300 requests a minute per address', () =>
    withRollback(async (tx) => {
      const post = webhook(tx, createRateLimiter(true))
      for (let i = 0; i < 300; i++) await post({ RecordType: 'Delivery' })
      const limited = await post({ RecordType: 'Delivery' })
      expect(limited.status).toBe(429)
      expect(limited.headers.get('retry-after')).toMatch(/^\d+$/)
    }))

  it('never logs the address from the payload', () =>
    withRollback(async (tx) => {
      const info = vi.spyOn(logger, 'info').mockImplementation(() => {})
      const { invitation } = await sentInvitation(tx, 'pm-8')
      await webhook(tx)(bounce(invitation.id, 'pm-8'))
      expect(info).toHaveBeenCalledWith(
        'Postmark webhook',
        expect.objectContaining({ outcome: 'bounced' }),
      )
      expect(JSON.stringify(info.mock.calls)).not.toContain('aisha@')
    }))
})

describe('an invitation through Postmark', () => {
  it('is recorded sent with Postmark’s id, then shows bounced on the Team page', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
        const sent = JSON.parse(String(init?.body)) as unknown[]
        return Response.json(sent.map((_, i) => ({ ErrorCode: 0, MessageID: `pm-flow-${i}` })))
      })
      const mailer = createPostmarkTransport({
        token: 'server-token',
        from: 'Vento Real Estate <no-reply@mail.vento.example>',
        stream: 'outbound',
        fetch: fetch as unknown as typeof globalThis.fetch,
      })
      const client = createRouterClient(router, {
        context: { ...testContext(tx, org.owner), mailer },
      })
      const email = uniqueEmail()

      const created = await client.invitations.create({
        items: [{ email, roleId: org.roleIds.get('sales') ?? '' }],
        entityIds: null,
      })
      const id = created.invitations[0]?.id ?? ''
      const [stored] = await tx.select().from(invitations).where(eq(invitations.id, id))
      expect(stored).toMatchObject({ delivery: 'sent', deliveryMessageId: 'pm-flow-0' })

      await webhook(tx)(bounce(id, 'pm-flow-0'))
      const { items } = await client.team.list({ show: 'invited' })
      expect(items.find((r) => r.id === id)).toMatchObject({ delivery: 'bounced' })
    }))
})
