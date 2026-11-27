import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, invitations, memberEntityLimits } from '@/db/schema'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { uniqueEmail, withRollback } from '@/test/db'
import { createEntity, createInvitation, createMember, createOrganization } from '@/test/factories'
import { clientAs } from '@/test/router-client'

// access.invitation.owner through the real invitations service and routers (plan §6.3, question 2).

async function world(tx: DbOrTx) {
  const org = await createOrganization(tx)
  await seedDefaultRules(tx, org.id, org.ownerMemberId)
  const bisi = await createMember(tx, org, { role: 'owner', name: 'Bisi Lawal' })
  return { org, bisi, owner: org.roleIds.get('owner') ?? '', sales: org.roleIds.get('sales') ?? '' }
}

async function invitationsFor(tx: DbOrTx, email: string) {
  return tx.select().from(invitations).where(eq(invitations.email, email))
}

describe('access.invitation.owner: inviting someone as an owner', () => {
  it('holds the owner invitation for approval and sends the others now', () =>
    withRollback(async (tx) => {
      const { org, owner, sales } = await world(tx)
      const [femi, grace] = [uniqueEmail('femi'), uniqueEmail('grace')]
      const { client, mailer } = clientAs(tx, org.owner)
      const result = await client.invitations.create({
        items: [
          { email: femi, roleId: owner },
          { email: grace, roleId: sales },
        ],
        entityIds: null,
        reason: 'Femi joins the board',
      })
      expect(result).toMatchObject({
        sent: 1,
        notice: `Invitation sent to ${grace}. The owner invitation to ${femi} waits for approval`,
      })
      expect(result.requested).toEqual([{ email: femi, requestId: expect.any(String) }])
      expect(await invitationsFor(tx, femi)).toEqual([])
      expect(await invitationsFor(tx, grace)).toHaveLength(1)
      expect(mailer.to(femi)).toEqual([])
      expect(mailer.to(org.owner.email)).toEqual([])
    }))

  it('creates and sends the invitation when approved, from the maker, 7 days from then', () =>
    withRollback(async (tx) => {
      const { org, bisi, owner } = await world(tx)
      const femi = uniqueEmail('femi')
      const result = await clientAs(tx, org.owner).client.invitations.create({
        items: [{ email: femi, roleId: owner }],
        entityIds: null,
        reason: 'Femi joins the board',
      })
      const requestId = result.requested?.[0]?.requestId ?? ''
      const approver = clientAs(tx, bisi.user)
      const before = Date.now()
      const done = await approver.client.approvals.decide({ requestId, decision: 'approve' })
      expect(done).toEqual({ ran: true, notice: `Invite ${femi} as an owner approved` })
      const [row] = await invitationsFor(tx, femi)
      expect(row).toMatchObject({
        status: 'pending',
        invitedByUserId: org.owner.id,
        delivery: 'sent',
      })
      expect(row?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * 3600_000 - 1000)
      expect(approver.mailer.to(femi)).toHaveLength(1)
      const [sent] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, 'invitation.sent')),
        )
      expect(sent).toMatchObject({ actorName: 'Olumide Bankole' })
      expect(sent?.metadata).toMatchObject({ approvedBy: [{ name: 'Bisi Lawal', position: 1 }] })
    }))

  it('expires as stale when someone invited the email meanwhile', () =>
    withRollback(async (tx) => {
      const { org, bisi, owner } = await world(tx)
      const femi = uniqueEmail('femi')
      const result = await clientAs(tx, org.owner).client.invitations.create({
        items: [{ email: femi, roleId: owner }],
        entityIds: null,
        reason: 'x',
      })
      await createInvitation(tx, org, { role: 'sales', email: femi })
      await expect(
        clientAs(tx, bisi.user).client.approvals.decide({
          requestId: result.requested?.[0]?.requestId ?? '',
          decision: 'approve',
        }),
      ).rejects.toMatchObject({ data: { reason: 'approval_stale' } })
      expect((await invitationsFor(tx, femi)).map((i) => i.roleId)).toEqual([
        org.roleIds.get('sales'),
      ])
    }))

  it('refuses a second owner invitation request for the same email', () =>
    withRollback(async (tx) => {
      const { org, owner } = await world(tx)
      const femi = uniqueEmail('femi')
      const { client } = clientAs(tx, org.owner)
      const input = { items: [{ email: femi, roleId: owner }], entityIds: null, reason: 'x' }
      const first = await client.invitations.create(input)
      await expect(client.invitations.create(input)).rejects.toMatchObject({
        data: { reason: 'approval_pending', requestId: first.requested?.[0]?.requestId },
      })
    }))

  it('refuses an owner invitation with nobody to approve while another owner exists', () =>
    withRollback(async (tx) => {
      const { org, bisi, owner } = await world(tx)
      const parkview = await createEntity(tx, org)
      await tx
        .insert(memberEntityLimits)
        .values({ organizationId: org.id, memberId: bisi.member.id, entityId: parkview.id })
      const femi = uniqueEmail('femi')
      await expect(
        clientAs(tx, org.owner).client.invitations.create({
          items: [{ email: femi, roleId: owner }],
          entityIds: null,
          reason: 'x',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'no_approver' } })
      expect(await invitationsFor(tx, femi)).toEqual([])
    }))
})

describe('access.invitation.owner: going ahead at once', () => {
  it('records the delivery of an owner invitation sent with no rule to wait for', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const femi = uniqueEmail('femi')
      const result = await clientAs(tx, org.owner).client.invitations.create({
        items: [{ email: femi, roleId: org.roleIds.get('owner') ?? '' }],
        entityIds: null,
      })
      expect(result.invitations[0]).toMatchObject({ email: femi, delivery: 'sent' })
      const [row] = await invitationsFor(tx, femi)
      expect(row?.delivery).toBe('sent')
    }))
})

describe('access.invitation.owner: resending an owner invitation (security M2)', () => {
  const lapsed = () => new Date(Date.now() - 24 * 3600_000)

  it('holds the resend for approval and leaves the expired invitation as it was', () =>
    withRollback(async (tx) => {
      const { org } = await world(tx)
      const { invitation } = await createInvitation(tx, org, { role: 'owner', expiresAt: lapsed() })
      const { client, mailer } = clientAs(tx, org.owner)
      const result = await client.invitations.resend({ id: invitation.id, reason: 'Femi lost it' })
      expect(result.outcome).toMatchObject({
        ran: false,
        notice: 'Sent to Bisi Lawal for approval',
      })
      const [row] = await invitationsFor(tx, invitation.email)
      expect(row).toMatchObject({
        status: 'pending',
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
      })
      expect(mailer.to(invitation.email)).toEqual([])
    }))

  it('asks why before sending a resend for approval', () =>
    withRollback(async (tx) => {
      const { org } = await world(tx)
      const { invitation } = await createInvitation(tx, org, { role: 'owner', expiresAt: lapsed() })
      await expect(
        clientAs(tx, org.owner).client.invitations.resend({ id: invitation.id }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'reason_required' } })
    }))

  it('revives the same invitation when approved, with a new link and 7 days from then', () =>
    withRollback(async (tx) => {
      const { org, bisi } = await world(tx)
      const { invitation } = await createInvitation(tx, org, { role: 'owner', expiresAt: lapsed() })
      const sent = await clientAs(tx, org.owner).client.invitations.resend({
        id: invitation.id,
        reason: 'Femi lost it',
      })
      if (sent.outcome?.ran !== false) throw new Error('expected a request')
      const approver = clientAs(tx, bisi.user)
      const before = Date.now()
      await approver.client.approvals.decide({
        requestId: sent.outcome.requestId,
        decision: 'approve',
      })
      const rows = await invitationsFor(tx, invitation.email)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: invitation.id, status: 'pending', delivery: 'sent' })
      expect(rows[0]?.tokenHash).not.toBe(invitation.tokenHash)
      expect(rows[0]?.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * 3600_000 - 1000)
      expect(approver.mailer.to(invitation.email)).toHaveLength(1)
      const [resent] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, 'invitation.resent')),
        )
      expect(resent).toMatchObject({ actorName: 'Olumide Bankole' })
      expect(resent?.metadata).toMatchObject({ approvedBy: [{ name: 'Bisi Lawal', position: 1 }] })
    }))

  it('expires the request as stale when the invitation was withdrawn while it waited', () =>
    withRollback(async (tx) => {
      const { org, bisi } = await world(tx)
      const { invitation } = await createInvitation(tx, org, { role: 'owner', expiresAt: lapsed() })
      const { client } = clientAs(tx, org.owner)
      const sent = await client.invitations.resend({ id: invitation.id, reason: 'x' })
      if (sent.outcome?.ran !== false) throw new Error('expected a request')
      await client.invitations.withdraw({ id: invitation.id })
      await expect(
        clientAs(tx, bisi.user).client.approvals.decide({
          requestId: sent.outcome.requestId,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({ data: { reason: 'approval_stale' } })
    }))

  it('still resends any other invitation at once', () =>
    withRollback(async (tx) => {
      const { org } = await world(tx)
      const { invitation } = await createInvitation(tx, org, { role: 'sales', expiresAt: lapsed() })
      const result = await clientAs(tx, org.owner).client.invitations.resend({ id: invitation.id })
      expect(result).toEqual({
        notice: `Invitation sent again to ${invitation.email}`,
        outcome: { ran: true, notice: `Invitation sent again to ${invitation.email}` },
      })
    }))
})
