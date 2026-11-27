import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { approvalRequests, auditEvents, memberEntityLimits, members } from '@/db/schema'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { withRollback } from '@/test/db'
import { createEntity, createMember, createOrganization } from '@/test/factories'
import { clientAs } from '@/test/router-client'

// access.member.make_owner through the real members service and routers (plan §6.3).

async function world(tx: DbOrTx) {
  const org = await createOrganization(tx)
  await seedDefaultRules(tx, org.id, org.ownerMemberId)
  const bisi = await createMember(tx, org, { role: 'owner', name: 'Bisi Lawal' })
  const aisha = await createMember(tx, org, { role: 'admin', name: 'Aisha Bello' })
  return { org, bisi, aisha, owner: org.roleIds.get('owner') ?? '' }
}

async function roleOf(tx: DbOrTx, memberId: string) {
  const [row] = await tx
    .select({ roleId: members.roleId })
    .from(members)
    .where(eq(members.id, memberId))
  return row?.roleId
}

describe('access.member.make_owner: making someone an owner', () => {
  it('waits for another owner, then makes them an owner and alerts the owners', () =>
    withRollback(async (tx) => {
      const { org, bisi, aisha, owner } = await world(tx)
      const maker = clientAs(tx, org.owner)
      const sent = await maker.client.members.updateAccess({
        memberId: aisha.member.id,
        roleId: owner,
        entityIds: null,
        reason: 'Aisha runs the group while I travel',
      })
      expect(sent.outcome).toMatchObject({ ran: false, notice: 'Sent to Bisi Lawal for approval' })
      expect(sent.row.role.key).toBe('admin')
      expect(await roleOf(tx, aisha.member.id)).toBe(aisha.member.roleId)
      if (sent.outcome?.ran !== false) throw new Error('expected a request')
      const team = await maker.client.team.list({})
      expect(team.items.find((r) => r.id === aisha.member.id)).toMatchObject({
        pendingApproval: { requestId: sent.outcome.requestId, waitingFor: 'Owner', isOwn: true },
      })

      const approver = clientAs(tx, bisi.user)
      const detail = await approver.client.approvals.get({ id: sent.outcome.requestId })
      expect(detail).toMatchObject({
        title: 'Make Aisha Bello an owner',
        approveLabel: 'Make Aisha Bello an owner',
        summary: { changes: [{ field: 'Role', before: 'Admin', after: 'Owner' }] },
      })
      await approver.client.approvals.decide({
        requestId: sent.outcome.requestId,
        decision: 'approve',
      })
      expect(await roleOf(tx, aisha.member.id)).toBe(owner)
      expect(approver.mailer.messages.filter((m) => m.tag === 'security_alert')).toHaveLength(3)
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            eq(auditEvents.action, 'member.access_changed'),
          ),
        )
      expect(event).toMatchObject({ actorName: 'Olumide Bankole' })
      expect(event?.metadata).toMatchObject({ approvedBy: [{ name: 'Bisi Lawal', position: 1 }] })
    }))

  it('goes ahead in a one-owner organization, marked in the audit trail', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await seedDefaultRules(tx, org.id, org.ownerMemberId)
      const aisha = await createMember(tx, org, { role: 'admin', name: 'Aisha Bello' })
      const done = await clientAs(tx, org.owner).client.members.updateAccess({
        memberId: aisha.member.id,
        roleId: org.roleIds.get('owner') ?? '',
        entityIds: null,
        reason: 'Second owner',
      })
      expect(done.outcome).toMatchObject({ ran: true })
      expect(done.row.role.key).toBe('owner')
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, org.id),
            eq(auditEvents.action, 'member.access_changed'),
          ),
        )
      expect(event?.metadata).toMatchObject({ noApprover: true })
    }))

  it('refuses with nobody to approve while another owner exists, even one limited to a company', () =>
    withRollback(async (tx) => {
      const { org, bisi, aisha, owner } = await world(tx)
      // Bisi limited to one company can't approve an organization-wide change (security M1).
      const parkview = await createEntity(tx, org)
      await tx
        .insert(memberEntityLimits)
        .values({ organizationId: org.id, memberId: bisi.member.id, entityId: parkview.id })
      await expect(
        clientAs(tx, org.owner).client.members.updateAccess({
          memberId: aisha.member.id,
          roleId: owner,
          entityIds: null,
          reason: 'x',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'no_approver' } })
      expect(await roleOf(tx, aisha.member.id)).toBe(aisha.member.roleId)
    }))

  it('changes any other role at once', () =>
    withRollback(async (tx) => {
      const { org, aisha } = await world(tx)
      const done = await clientAs(tx, org.owner).client.members.updateAccess({
        memberId: aisha.member.id,
        roleId: org.roleIds.get('finance') ?? '',
        entityIds: null,
      })
      expect(done).toMatchObject({ outcome: { ran: true }, row: { role: { key: 'finance' } } })
    }))

  it('refuses a second request to make the same person an owner', () =>
    withRollback(async (tx) => {
      const { org, aisha, owner } = await world(tx)
      const { client } = clientAs(tx, org.owner)
      const input = { memberId: aisha.member.id, roleId: owner, entityIds: null, reason: 'x' }
      const first = await client.members.updateAccess(input)
      if (first.outcome?.ran !== false) throw new Error('expected a request')
      await expect(client.members.updateAccess(input)).rejects.toMatchObject({
        data: { reason: 'approval_pending', requestId: first.outcome.requestId },
      })
    }))

  it('cancels the request when the maker is removed', () =>
    withRollback(async (tx) => {
      const { org, bisi, aisha, owner } = await world(tx)
      const sent = await clientAs(tx, bisi.user).client.members.updateAccess({
        memberId: aisha.member.id,
        roleId: owner,
        entityIds: null,
        reason: 'x',
      })
      if (sent.outcome?.ran !== false) throw new Error('expected a request')
      await clientAs(tx, org.owner).client.members.remove({ memberId: bisi.member.id })
      const [row] = await tx
        .select()
        .from(approvalRequests)
        .where(eq(approvalRequests.id, sent.outcome.requestId))
      expect(row).toMatchObject({ status: 'cancelled', endedReason: 'maker_left' })
    }))
})
