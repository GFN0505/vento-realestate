import { emptyPermissionSet, type PermissionSet } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { auditEvents, roles } from '@/db/schema'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { withRollback } from '@/test/db'
import { createCustomRole, createMember, createOrganization, type TestOrg } from '@/test/factories'
import { clientAs } from '@/test/router-client'

// access.role.update through the real roles service and routers (plan §6.3).

const SITE: Partial<PermissionSet> = { projects: ['view', 'create'], documents: ['view'] }

async function world(tx: DbOrTx, options: { secondOwner?: boolean; held?: boolean } = {}) {
  const org = await createOrganization(tx)
  await seedDefaultRules(tx, org.id, org.ownerMemberId)
  const ope = await createMember(tx, org, { role: 'admin', name: 'Ope Martins' })
  const role = await createCustomRole(tx, org, { permissions: SITE })
  if (options.held !== false) await createMember(tx, org, { role: 'viewer', roleId: role.id })
  return { org, ope, role }
}

const withApprove = (): PermissionSet => ({
  ...emptyPermissionSet(),
  projects: ['view', 'create', 'approve'],
  documents: ['view'],
})

async function versionOf(tx: DbOrTx, id: string) {
  const [row] = await tx.select({ version: roles.version }).from(roles).where(eq(roles.id, id))
  return row?.version
}

async function auditOf(tx: DbOrTx, org: TestOrg, action: string) {
  return tx
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.organizationId, org.id), eq(auditEvents.action, action)))
}

describe('access.role.update: changing a held role’s permissions', () => {
  it('waits for approval, then runs on the approver’s yes as the maker’s change', () =>
    withRollback(async (tx) => {
      const { org, ope, role } = await world(tx)
      const maker = clientAs(tx, ope.user)
      const sent = await maker.client.roles.update({
        id: role.id,
        version: 1,
        permissions: withApprove(),
        requiresTwoStep: true,
        reason: 'Halima signs off site POs now',
      })
      expect(sent.outcome).toMatchObject({
        ran: false,
        notice: 'Sent to Olumide Bankole for approval',
      })
      expect(sent.role.version).toBe(1)
      expect(sent.role.permissions.projects).toEqual(['view', 'create'])
      expect(maker.mailer.to(org.owner.email)[0]?.subject).toBe(
        'Approval needed: Site engineer: Projects & construction approve added',
      )
      if (sent.outcome?.ran !== false) throw new Error('expected a request')
      expect((await maker.client.roles.get({ id: role.id })).pendingApproval).toEqual({
        requestId: sent.outcome.requestId,
        waitingFor: 'Owner or Admin',
        requestedAt: expect.any(String),
        isOwn: true,
      })

      const approver = clientAs(tx, org.owner)
      const detail = await approver.client.approvals.get({ id: sent.outcome.requestId })
      expect(detail).toMatchObject({ canDecide: true, approveLabel: 'Approve role change' })
      expect(detail.summary.changes).toContainEqual({
        field: 'Projects & construction',
        before: 'View, Create',
        after: 'View, Create, Approve',
      })
      const done = await approver.client.approvals.decide({
        requestId: sent.outcome.requestId,
        decision: 'approve',
      })
      expect(done.ran).toBe(true)
      expect(await versionOf(tx, role.id)).toBe(2)
      expect((await approver.client.roles.get({ id: role.id })).pendingApproval).toBeNull()
      const [event] = await auditOf(tx, org, 'role.updated')
      expect(event).toMatchObject({ actorName: 'Ope Martins' })
      expect(event?.metadata).toMatchObject({
        approvedBy: [{ name: 'Olumide Bankole', position: 1 }],
        approvalRequestId: sent.outcome.requestId,
      })
      expect(approver.mailer.to(ope.user.email)[0]?.subject).toBe(
        'Approved: Site engineer: Projects & construction approve added',
      )
    }))

  it('asks for a reason before anything is saved', () =>
    withRollback(async (tx) => {
      const { ope, role } = await world(tx)
      await expect(
        clientAs(tx, ope.user).client.roles.update({
          id: role.id,
          version: 1,
          permissions: withApprove(),
          requiresTwoStep: true,
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'reason_required' } })
    }))

  it('runs a rename at once, rule or not', () =>
    withRollback(async (tx) => {
      const { ope, role } = await world(tx)
      const saved = await clientAs(tx, ope.user).client.roles.update({
        id: role.id,
        version: 1,
        name: 'Site lead',
      })
      expect(saved).toMatchObject({
        outcome: { ran: true },
        role: { name: 'Site lead', version: 2 },
      })
    }))

  it('runs at once for a role nobody holds (plan question 1)', () =>
    withRollback(async (tx) => {
      const { ope, role } = await world(tx, { held: false })
      const saved = await clientAs(tx, ope.user).client.roles.update({
        id: role.id,
        version: 1,
        permissions: withApprove(),
        requiresTwoStep: true,
      })
      expect(saved.outcome).toMatchObject({ ran: true })
      expect(saved.role.permissions.projects).toContain('approve')
    }))

  it('goes ahead in a one-owner organization, marked in the audit trail', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await seedDefaultRules(tx, org.id, org.ownerMemberId)
      const role = await createCustomRole(tx, org, { permissions: SITE })
      await createMember(tx, org, { role: 'viewer', roleId: role.id })
      const saved = await clientAs(tx, org.owner).client.roles.update({
        id: role.id,
        version: 1,
        permissions: withApprove(),
        requiresTwoStep: true,
        reason: 'Only me here',
      })
      expect(saved.outcome).toMatchObject({ ran: true })
      const [event] = await auditOf(tx, org, 'role.updated')
      expect(event?.metadata).toMatchObject({ noApprover: true })
    }))

  it('excludes holders and approvers without the access it gives, with the reason', () =>
    withRollback(async (tx) => {
      const { org, role } = await world(tx)
      const officeRole = await createCustomRole(tx, org, {
        name: 'Office manager',
        permissions: { settings: ['view', 'create', 'edit', 'approve'] },
        requiresTwoStep: true,
      })
      const office = await createMember(tx, org, { role: 'admin', roleId: officeRole.id })
      // The rule lets Office managers approve too.
      await tx.execute(sql`
        insert into approval_rule_step_roles (organization_id, step_id, role_id)
        select organization_id, step_id, ${officeRole.id} from approval_rule_step_roles
        where organization_id = ${org.id} group by organization_id, step_id`)
      const sent = await clientAs(tx, org.owner).client.roles.update({
        id: role.id,
        version: 1,
        permissions: withApprove(),
        requiresTwoStep: true,
        reason: 'x',
      })
      if (sent.outcome?.ran !== false) throw new Error('expected a request')
      const seen = await clientAs(tx, office.user).client.approvals.get({
        id: sent.outcome.requestId,
      })
      expect(seen).toMatchObject({
        canDecide: false,
        blockedReason:
          "This change gives access you don't have, so another owner or admin approves it.",
      })
    }))

  it('expires as stale when the role was saved after the request', () =>
    withRollback(async (tx) => {
      const { org, ope, role } = await world(tx)
      const maker = clientAs(tx, ope.user).client
      const sent = await maker.roles.update({
        id: role.id,
        version: 1,
        permissions: withApprove(),
        requiresTwoStep: true,
        reason: 'x',
      })
      if (sent.outcome?.ran !== false) throw new Error('expected a request')
      await maker.roles.update({ id: role.id, version: 1, description: 'On site' })
      await expect(
        clientAs(tx, org.owner).client.approvals.decide({
          requestId: sent.outcome.requestId,
          decision: 'approve',
        }),
      ).rejects.toMatchObject({
        data: { reason: 'approval_stale' },
        message: 'Site engineer changed after this was asked, so this request has expired.',
      })
      const [row] = await tx.select().from(roles).where(eq(roles.id, role.id))
      expect(row).toMatchObject({ version: 2, requiresTwoStep: false })
    }))

  it('previews the approval for a held role and none for one nobody holds', () =>
    withRollback(async (tx) => {
      const { org, ope, role } = await world(tx)
      const unheld = await createCustomRole(tx, org, {
        name: 'Auditor',
        permissions: { land: ['view'] },
      })
      const { client } = clientAs(tx, ope.user)
      expect(
        await client.approvals.preview({
          actionKey: 'access.role.update',
          subject: { type: 'role', id: role.id },
        }),
      ).toEqual({
        needed: true,
        chain: 'Needs approval by Owner or Admin.',
        policy: "Change a role's permissions needs approval by Owner or Admin.",
        blocked: null,
        pendingRequestId: null,
      })
      expect(
        await client.approvals.preview({
          actionKey: 'access.role.update',
          subject: { type: 'role', id: unheld.id },
        }),
      ).toEqual({ needed: false })
    }))
})
