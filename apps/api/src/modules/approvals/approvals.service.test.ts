import { emptyPermissionSet } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { approvalRequests } from '@/db/schema'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { withRollback } from '@/test/db'
import {
  createApprovalRule,
  createCustomRole,
  createEntity,
  createMember,
  createOfficeManager,
  createOrganization,
  type TestOrg,
  type TestUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'

// The inbox: what each person sees, in which tab, and the top bar's count.

async function world(tx: DbOrTx) {
  const org = await createOrganization(tx)
  await seedDefaultRules(tx, org.id, org.ownerMemberId)
  const ope = await createMember(tx, org, { role: 'admin', name: 'Ope Martins' })
  return { org, ope }
}

/** A held custom role, and a request by `maker` to add Approve in Projects. */
async function askRoleChange(tx: DbOrTx, org: TestOrg, maker: TestUser, name = 'Site engineer') {
  const role = await createCustomRole(tx, org, { name, permissions: { projects: ['view'] } })
  await createMember(tx, org, { role: 'viewer', roleId: role.id })
  const sent = await clientAs(tx, maker).client.roles.update({
    id: role.id,
    version: 1,
    permissions: { ...emptyPermissionSet(), projects: ['view', 'approve'] },
    requiresTwoStep: true,
    reason: 'Halima signs off site POs now',
  })
  if (sent.outcome?.ran !== false) throw new Error('expected a request')
  return sent.outcome.requestId
}

describe('approvals inbox', () => {
  it('shows a request waiting for the approver, mine for the maker, and decided after', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      const id = await askRoleChange(tx, org, ope.user)
      const owner = clientAs(tx, org.owner).client
      const waiting = await owner.approvals.list({ tab: 'waiting' })
      expect(waiting).toMatchObject({ total: 1, waitingCount: 1 })
      expect(waiting.items[0]).toMatchObject({
        id,
        chip: 'Roles',
        title: 'Site engineer: Projects & construction approve added',
        makerName: 'Ope Martins',
        reason: 'Halima signs off site POs now',
        waitingFor: 'Owner or Admin',
        status: 'pending',
      })
      const mine = await clientAs(tx, ope.user).client.approvals.list({ tab: 'mine' })
      expect(mine.items.map((r) => r.id)).toEqual([id])
      expect(mine.waitingCount).toBe(0)
      await owner.approvals.decide({ requestId: id, decision: 'approve' })
      const decided = await owner.approvals.list({ tab: 'decided' })
      expect(decided.items[0]).toMatchObject({
        id,
        status: 'approved',
        lastDecision: { name: 'Olumide Bankole', decision: 'approve' },
      })
      expect((await owner.approvals.list({ tab: 'waiting' })).total).toBe(0)
    }))

  it('lists the oldest first while waiting', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      const first = await askRoleChange(tx, org, ope.user, 'Site engineer')
      await tx
        .update(approvalRequests)
        .set({ createdAt: new Date(Date.now() - 3600_000) })
        .where(eq(approvalRequests.id, first))
      const second = await askRoleChange(tx, org, ope.user, 'Site lead')
      const { items } = await clientAs(tx, org.owner).client.approvals.list({ tab: 'waiting' })
      expect(items.map((r) => r.id)).toEqual([first, second])
    }))

  it('shows the maker their own request with the reviewer and Cancel, never the buttons', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      const id = await askRoleChange(tx, org, ope.user)
      const detail = await clientAs(tx, ope.user).client.approvals.get({ id })
      expect(detail).toMatchObject({
        isOwn: true,
        canDecide: false,
        canCancel: true,
        reviewerHint: 'Olumide Bankole (Owner) will review it.',
        policy: "Change a role's permissions needs approval by Owner or Admin.",
        steps: [{ position: 1, text: 'Owner or Admin', state: 'waiting', isYou: false }],
      })
    }))

  it('hides a request from anyone who isn’t its maker, a decider or an approver of its step', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      const id = await askRoleChange(tx, org, ope.user)
      const grace = await createMember(tx, org, { role: 'sales', name: 'Grace Umeh' })
      const { client } = clientAs(tx, grace.user)
      await expect(client.approvals.get({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(client.approvals.cancel({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      for (const tab of ['waiting', 'mine', 'decided'] as const) {
        expect((await client.approvals.list({ tab })).total).toBe(0)
      }
    }))

  it('shows step 2 to its approvers only once step 1 is approved', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ope = await createMember(tx, org, { role: 'admin', name: 'Ope Martins' })
      const aisha = await createMember(tx, org, { role: 'admin', name: 'Aisha Bello' })
      await createApprovalRule(tx, org, { steps: [['admin'], ['owner']] })
      const id = await askRoleChange(tx, org, ope.user)
      const owner = clientAs(tx, org.owner).client
      expect((await owner.approvals.list({ tab: 'waiting' })).total).toBe(0)
      await expect(owner.approvals.get({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await clientAs(tx, aisha.user).client.approvals.decide({ requestId: id, decision: 'approve' })
      expect((await owner.approvals.list({ tab: 'waiting' })).total).toBe(1)
      const detail = await owner.approvals.get({ id })
      expect(detail.steps.map((s) => s.state)).toEqual(['approved', 'waiting'])
      expect(detail.steps[1]?.isYou).toBe(true)
    }))

  it('lets the maker cancel while it waits, and nobody decide it after', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      const id = await askRoleChange(tx, org, ope.user)
      expect(await clientAs(tx, ope.user).client.approvals.cancel({ id })).toEqual({
        notice: 'Request cancelled',
      })
      await expect(
        clientAs(tx, org.owner).client.approvals.decide({ requestId: id, decision: 'approve' }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'approval_not_pending' } })
      const mine = await clientAs(tx, ope.user).client.approvals.get({ id })
      expect(mine).toMatchObject({ status: 'cancelled', endedNote: 'Cancelled by Ope Martins' })
    }))

  it('reads a request past its 7 days as expired on the list', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      const id = await askRoleChange(tx, org, ope.user)
      await tx
        .update(approvalRequests)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(approvalRequests.id, id))
      const owner = clientAs(tx, org.owner).client
      expect((await owner.approvals.list({ tab: 'waiting' })).total).toBe(0)
      const mine = await clientAs(tx, ope.user).client.approvals.list({ tab: 'mine' })
      expect(mine.items[0]).toMatchObject({ status: 'expired', endedReason: 'timeout' })
    }))

  it('follows the company switcher, keeping organization-wide requests in every company', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      const parkview = await createEntity(tx, org)
      const other = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const theirs = await createEntity(tx, other)
      await askRoleChange(tx, org, ope.user)
      const owner = clientAs(tx, org.owner).client
      expect((await owner.approvals.list({ tab: 'waiting', entityId: parkview.id })).total).toBe(1)
      expect((await owner.approvals.list({ tab: 'waiting', entityId: theirs.id })).total).toBe(0)
    }))
})

describe('account.me: approvals', () => {
  it('counts what waits for an approver and shows Approvals to them', () =>
    withRollback(async (tx) => {
      const { org, ope } = await world(tx)
      await askRoleChange(tx, org, ope.user)
      const me = await clientAs(tx, org.owner).client.account.me()
      expect(me).toMatchObject({ approvalsWaiting: 1, canSeeApprovals: true })
    }))

  it('shows Approvals to a maker without Approve only after they asked', () =>
    withRollback(async (tx) => {
      const { org } = await world(tx)
      const office = await createOfficeManager(tx, org)
      const before = await clientAs(tx, office.user).client.account.me()
      expect(before).toMatchObject({ approvalsWaiting: 0, canSeeApprovals: false })
      // An Office manager can't give Approve, so they ask for a smaller change.
      const role = await createCustomRole(tx, org, {
        name: 'Clerk',
        permissions: { sales: ['view'] },
      })
      await createMember(tx, org, { role: 'viewer', roleId: role.id })
      await clientAs(tx, office.user).client.roles.update({
        id: role.id,
        version: 1,
        permissions: { ...emptyPermissionSet(), sales: ['view', 'create'] },
        reason: 'Clerks record leads',
      })
      const after = await clientAs(tx, office.user).client.account.me()
      expect(after).toMatchObject({ approvalsWaiting: 0, canSeeApprovals: true })
    }))
})
