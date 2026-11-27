import { APPROVAL_ACTIONS, type ApprovalActionMeta } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import {
  approvalDecisions,
  approvalRequestStepRoles,
  approvalRequests,
  approvalRuleStepRoles,
  auditEvents,
  entities,
} from '@/db/schema'
import { recordAudit } from '@/modules/audit/audit.service'
import { removeMember } from '@/modules/members/members.service'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createApprovalRule,
  createEntity,
  createMember,
  createOrganization,
  type TestOrg,
} from '@/test/factories'
import { decide, expireDue, requestOrRun } from './engine'
import { StaleError } from './errors'
import { type ApprovalPlugin, approvalMetadata, registerPlugin } from './plugin'
import { approvalPlugins } from './registry'

// The engine with a test-only plug-in: renaming a company (company-scoped, so the company rules
// and limits apply), filed under the first catalog key so the catalog's metadata applies.

const renamePayload = z.object({
  entityId: z.uuid(),
  name: z.string(),
  expectedName: z.string(),
  exclude: z.array(z.uuid()).default([]),
})
type Rename = z.output<typeof renamePayload>

const renamePlugin: ApprovalPlugin<Rename> = {
  key: 'access.role.update',
  permission: { module: 'settings', action: 'edit' },
  payload: renamePayload,
  subject: (p) => ({ type: 'entity', id: p.entityId }),
  describe: async (_tx, _ctx, p) => ({
    entityId: p.entityId,
    summary: {
      title: `Rename ${p.expectedName}`,
      recordLabel: p.expectedName,
      recordLink: null,
      amount: null,
      changes: [{ field: 'Name', before: p.expectedName, after: p.name }],
    },
  }),
  excluded: async (_tx, _ctx, p) =>
    p.exclude.map((userId) => ({
      userId,
      reason: 'You recorded this, so someone else approves it.',
    })),
  async execute(tx, ctx, p, meta) {
    const [row] = await tx
      .select({ name: entities.name })
      .from(entities)
      .where(and(eq(entities.organizationId, ctx.organizationId), eq(entities.id, p.entityId)))
      .for('update')
    if (row?.name !== p.expectedName) throw new StaleError()
    await tx.update(entities).set({ name: p.name }).where(eq(entities.id, p.entityId))
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'entity.updated',
      actor: actorOf(ctx),
      target: { type: 'entity', id: p.entityId, label: p.name },
      before: { name: p.expectedName },
      after: { name: p.name },
      metadata: approvalMetadata(meta),
    })
    return { notice: `${p.name} saved`, emails: [], afterCommit: null }
  },
}

const registry = { ...approvalPlugins(), 'access.role.update': registerPlugin(renamePlugin) }

type World = {
  org: TestOrg
  parkview: { id: string; name: string }
  owner: ServiceContext
  maker: ServiceContext
  makerMemberId: string
}

/** Olumide (owner) approves; Ope (admin) asks. */
async function world(tx: DbOrTx): Promise<World> {
  const org = await createOrganization(tx)
  const parkview = await createEntity(tx, org)
  const ope = await createMember(tx, org, { role: 'admin', name: 'Ope Martins' })
  return {
    org,
    parkview,
    owner: await contextFor(tx, org.owner, org),
    maker: await contextFor(tx, ope.user, org),
    makerMemberId: ope.member.id,
  }
}

const rename = (w: World, extra: Partial<Rename> = {}): Rename => ({
  entityId: w.parkview.id,
  name: 'Parkview Ltd',
  expectedName: w.parkview.name,
  exclude: [],
  ...extra,
})

async function ask(tx: DbOrTx, w: World, payload = rename(w), reason = 'New CAC name') {
  const out = await requestOrRun(tx, w.maker, renamePlugin, { payload, reason })
  if (out.ran) throw new Error('expected a request')
  return out
}

async function nameOf(tx: DbOrTx, id: string) {
  const [row] = await tx.select({ name: entities.name }).from(entities).where(eq(entities.id, id))
  return row?.name
}

async function requestRow(tx: DbOrTx, id: string) {
  const [row] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, id))
  return row
}

const approve = (ctx: ServiceContext, requestId: string) =>
  decide(ctx, { requestId, decision: 'approve' }, registry)

describe('approvals engine: requesting', () => {
  it('runs at once when no rule applies', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const out = await requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w) })
      expect(out).toMatchObject({ ran: true, result: { notice: 'Parkview Ltd saved' } })
      expect(await nameOf(tx, w.parkview.id)).toBe('Parkview Ltd')
      expect(
        await tx
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.organizationId, w.org.id)),
      ).toHaveLength(0)
    }))

  it('saves a request with the steps copied and changes nothing else', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner', 'admin']] })
      const out = await ask(tx, w)
      expect(out.notice).toBe('Sent to Olumide Bankole for approval')
      expect(out.emails.map((e) => e.to)).toEqual([w.org.owner.email])
      expect(out.emails[0]?.subject).toBe(`Approval needed: Rename ${w.parkview.name}`)
      expect(await nameOf(tx, w.parkview.id)).toBe(w.parkview.name)
      const row = await requestRow(tx, out.requestId)
      expect(row).toMatchObject({
        status: 'pending',
        currentStep: 1,
        stepCount: 1,
        reason: 'New CAC name',
      })
      expect(row?.policy).toBe("Change a role's permissions needs approval by Owner or Admin.")
      const steps = await tx
        .select()
        .from(approvalRequestStepRoles)
        .where(eq(approvalRequestStepRoles.requestId, out.requestId))
      expect(steps).toHaveLength(2)
      const [audit] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, w.org.id),
            eq(auditEvents.action, 'approval.requested'),
          ),
        )
      expect(audit?.metadata).toMatchObject({
        approvalRequestId: out.requestId,
        entityId: w.parkview.id,
      })
    }))

  it('asks for a reason when a rule applies', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      await expect(
        requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w), reason: '  ' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'reason_required' } })
    }))

  it('refuses a second pending request for the same record with the first one’s id', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const first = await ask(tx, w)
      await expect(ask(tx, w)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'approval_pending', requestId: first.requestId },
      })
    }))

  it('goes ahead and marks the audit when nobody else can approve (proceed)', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      // Only admins approve, and the only admin is the maker.
      await createApprovalRule(tx, w.org, { steps: [['admin']] })
      const out = await requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w), reason: 'x' })
      expect(out.ran).toBe(true)
      const [audit] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.organizationId, w.org.id), eq(auditEvents.action, 'entity.updated')),
        )
      expect(audit?.metadata).toEqual({ noApprover: true })
    }))

  it('emails every other owner when it goes ahead with nobody else to approve', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const bisi = await createMember(tx, w.org, { role: 'owner', name: 'Bisi Lawal' })
      await createApprovalRule(tx, w.org, { steps: [['admin']] })
      const out = await requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w), reason: 'x' })
      if (!out.ran) throw new Error('expected it to run')
      expect(out.result.emails.map((e) => e.to).sort()).toEqual(
        [w.org.owner.email, bisi.user.email].sort(),
      )
      expect(out.result.emails[0]).toMatchObject({
        tag: 'approval',
        subject: `Vento Real Estate: a change went ahead without approval in ${w.org.name}`,
      })
      expect(out.result.emails[0]?.text).toContain(`Ope Martins made this change in ${w.org.name}`)
    }))

  it('goes ahead when a later step has nobody to approve, instead of saving a request that stalls', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      // Step 1 has the owner; step 2's only admin is the maker.
      await createApprovalRule(tx, w.org, { steps: [['owner'], ['admin']] })
      const out = await requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w), reason: 'x' })
      expect(out.ran).toBe(true)
      expect(await nameOf(tx, w.parkview.id)).toBe('Parkview Ltd')
      expect(
        await tx
          .select()
          .from(approvalRequests)
          .where(eq(approvalRequests.organizationId, w.org.id)),
      ).toEqual([])
    }))

  it('counts one person once across steps: two Owner steps need two owners besides the maker', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner'], ['owner']] })
      const out = await requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w), reason: 'x' })
      expect(out.ran).toBe(true)
    }))

  it('sets the 7 days on the database clock', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      const result = await tx.execute<{ exact: boolean }>(sql`
        select expires_at = created_at + interval '7 days' as exact
        from approval_requests where id = ${out.requestId}`)
      expect(result.rows[0]?.exact).toBe(true)
    }))

  describe('when the catalog refuses without an approver', () => {
    const meta = APPROVAL_ACTIONS['access.role.update'] as {
      -readonly [K in keyof ApprovalActionMeta]: ApprovalActionMeta[K]
    }
    afterEach(() => {
      meta.whenNoApprover = 'proceed'
    })

    it('refuses before anything is saved, naming the company', () =>
      withRollback(async (tx) => {
        meta.whenNoApprover = 'refuse'
        const w = await world(tx)
        await createApprovalRule(tx, w.org, { steps: [['admin']] })
        await expect(
          requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w), reason: 'x' }),
        ).rejects.toMatchObject({
          code: 'CONFLICT',
          data: { reason: 'no_approver' },
          message: `Nobody else can approve this in ${w.parkview.name}. Ask an owner to add an approver to the rule.`,
        })
        expect(await nameOf(tx, w.parkview.id)).toBe(w.parkview.name)
      }))

    it('refuses when only a later step has nobody to approve', () =>
      withRollback(async (tx) => {
        meta.whenNoApprover = 'refuse'
        const w = await world(tx)
        await createApprovalRule(tx, w.org, { steps: [['owner'], ['admin']] })
        await expect(
          requestOrRun(tx, w.maker, renamePlugin, { payload: rename(w), reason: 'x' }),
        ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'no_approver' } })
      }))
  })
})

describe('approvals engine: separation of duties', () => {
  it('never lets the maker decide, even an owner', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner', 'admin']] })
      const out = await requestOrRun(tx, w.owner, renamePlugin, { payload: rename(w), reason: 'x' })
      if (out.ran) throw new Error('expected a request')
      await expect(approve(w.owner, out.requestId)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'own_request' },
      })
    }))

  it('never lets one person decide two steps', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      // A second owner, so the chain can be finished and a request is saved.
      await createMember(tx, w.org, { role: 'owner', name: 'Bisi Lawal' })
      await createApprovalRule(tx, w.org, { steps: [['owner'], ['owner']] })
      const out = await ask(tx, w)
      await approve(w.owner, out.requestId)
      await expect(approve(w.owner, out.requestId)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'not_eligible' },
      })
    }))

  it('refuses an excluded person with the reason', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const second = await createMember(tx, w.org, { role: 'owner', name: 'Bisi Lawal' })
      const out = await ask(tx, w, rename(w, { exclude: [w.org.owner.id] }))
      await expect(approve(w.owner, out.requestId)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'not_eligible' },
        message: 'You recorded this, so someone else approves it.',
      })
      await approve(await contextFor(tx, second.user, w.org), out.requestId)
      expect(await nameOf(tx, w.parkview.id)).toBe('Parkview Ltd')
    }))

  it('leaves out an approver limited to another company, and lets one in this company approve', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const lekki = await createEntity(tx, w.org, { name: 'Lekki Pearl Estates Ltd' })
      await createApprovalRule(tx, w.org, { steps: [['admin']], entityIds: [w.parkview.id] })
      const elsewhere = await createMember(tx, w.org, { role: 'admin', entityIds: [lekki.id] })
      const here = await createMember(tx, w.org, { role: 'admin', entityIds: [w.parkview.id] })
      const out = await ask(tx, w)
      expect(out.emails.map((e) => e.to)).toEqual([here.user.email])
      await expect(
        approve(await contextFor(tx, elsewhere.user, w.org), out.requestId),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
      await approve(await contextFor(tx, here.user, w.org), out.requestId)
      expect(await nameOf(tx, w.parkview.id)).toBe('Parkview Ltd')
    }))
})

describe('approvals engine: deciding', () => {
  it('runs a two-step chain on the second approval, the action audited with its approvers', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const aisha = await createMember(tx, w.org, { role: 'admin', name: 'Aisha Bello' })
      await createApprovalRule(tx, w.org, { steps: [['admin'], ['owner']] })
      const out = await ask(tx, w)
      const first = await approve(await contextFor(tx, aisha.user, w.org), out.requestId)
      expect(first).toMatchObject({
        ran: false,
        notice: `Rename ${w.parkview.name} approved · now with Owner`,
      })
      expect(first.emails.map((e) => e.to)).toEqual([w.org.owner.email])
      expect(await nameOf(tx, w.parkview.id)).toBe(w.parkview.name)
      const last = await approve(w.owner, out.requestId)
      expect(last.ran).toBe(true)
      expect(last.emails.map((e) => e.subject)).toContain(`Approved: Rename ${w.parkview.name}`)
      expect(await nameOf(tx, w.parkview.id)).toBe('Parkview Ltd')
      expect(await requestRow(tx, out.requestId)).toMatchObject({
        status: 'approved',
        currentStep: 2,
      })
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.organizationId, w.org.id), eq(auditEvents.action, 'entity.updated')),
        )
      // The change is the maker's (plan question 3), with the approvers in order.
      expect(event).toMatchObject({ actorName: 'Ope Martins' })
      expect(event?.metadata).toEqual({
        approvedBy: [
          { name: 'Aisha Bello', position: 1 },
          { name: 'Olumide Bankole', position: 2 },
        ],
        approvalRequestId: out.requestId,
      })
    }))

  it('leaves everything unchanged on reject and tells the maker', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      const result = await decide(
        w.owner,
        { requestId: out.requestId, decision: 'reject', comment: 'Wait for the CAC letter' },
        registry,
      )
      expect(result.notice).toBe(
        `Rename ${w.parkview.name} rejected · Ope Martins will see your comment`,
      )
      expect(result.emails[0]?.subject).toBe(
        `Rejected: Rename ${w.parkview.name} · “Wait for the CAC letter”`,
      )
      expect(await nameOf(tx, w.parkview.id)).toBe(w.parkview.name)
      expect(await requestRow(tx, out.requestId)).toMatchObject({ status: 'rejected' })
    }))

  it('expires a request whose record changed, and leaves the record as it is', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      await tx
        .update(entities)
        .set({ name: 'Changed meanwhile Ltd' })
        .where(eq(entities.id, w.parkview.id))
      await expect(approve(w.owner, out.requestId)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'approval_stale' },
        message: `${w.parkview.name} changed after this was asked, so this request has expired.`,
      })
      expect(await nameOf(tx, w.parkview.id)).toBe('Changed meanwhile Ltd')
      expect(await requestRow(tx, out.requestId)).toMatchObject({
        status: 'expired',
        endedReason: 'stale',
      })
      expect(
        await tx
          .select()
          .from(approvalDecisions)
          .where(eq(approvalDecisions.requestId, out.requestId)),
      ).toEqual([])
    }))

  it('expires a request as stale when the maker lost the permission', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      await tx.execute(
        sql`update members set role_id = ${w.org.roleIds.get('viewer')} where id = ${w.makerMemberId}`,
      )
      await expect(approve(w.owner, out.requestId)).rejects.toMatchObject({
        data: { reason: 'approval_stale' },
      })
      expect(await nameOf(tx, w.parkview.id)).toBe(w.parkview.name)
    }))

  it('tells a late decider who decided the step they were looking at', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const second = await createMember(tx, w.org, { role: 'owner', name: 'Bisi Lawal' })
      await createApprovalRule(tx, w.org, { steps: [['owner'], ['owner']] })
      const out = await ask(tx, w)
      await approve(w.owner, out.requestId)
      await expect(
        decide(
          await contextFor(tx, second.user, w.org),
          { requestId: out.requestId, decision: 'approve', step: 1 },
          registry,
        ),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'approval_decided' },
        message: 'Olumide Bankole approved this a moment ago.',
      })
    }))

  it('keeps a pending request’s copied steps when its rule is edited', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const ruleId = await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      // The rule now says Finance only; the request still waits for an owner.
      await tx.execute(sql`update approval_rule_step_roles set role_id = ${w.org.roleIds.get('finance')}
        where step_id in (select id from approval_rule_steps where rule_id = ${ruleId})`)
      expect(
        await tx
          .select()
          .from(approvalRuleStepRoles)
          .where(eq(approvalRuleStepRoles.organizationId, w.org.id)),
      ).toHaveLength(1)
      await approve(w.owner, out.requestId)
      expect(await nameOf(tx, w.parkview.id)).toBe('Parkview Ltd')
    }))
})

describe('approvals engine: ending without a decision', () => {
  it('reads a request past 7 days as expired when someone decides, and audits it once', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      await tx
        .update(approvalRequests)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(approvalRequests.id, out.requestId))
      await expect(approve(w.owner, out.requestId)).rejects.toMatchObject({
        data: { reason: 'approval_expired' },
      })
      await expect(approve(w.owner, out.requestId)).rejects.toMatchObject({
        data: { reason: 'approval_expired' },
      })
      const expired = await tx
        .select()
        .from(auditEvents)
        .where(
          and(eq(auditEvents.organizationId, w.org.id), eq(auditEvents.action, 'approval.expired')),
        )
      expect(expired).toHaveLength(1)
      expect(expired[0]).toMatchObject({ actorName: 'System', actorUserId: null })
    }))

  it('expires due requests in the daily sweep and leaves the rest', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const old = await ask(tx, w)
      const fresh = await ask(
        tx,
        w,
        rename(w, {
          entityId: (await createEntity(tx, w.org, { name: 'Lekki Ltd' })).id,
          expectedName: 'Lekki Ltd',
        }),
      )
      await tx
        .update(approvalRequests)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(approvalRequests.id, old.requestId))
      expect(await expireDue(tx, new Date(), w.org.id)).toBe(1)
      expect(await requestRow(tx, old.requestId)).toMatchObject({
        status: 'expired',
        endedReason: 'timeout',
      })
      expect(await requestRow(tx, fresh.requestId)).toMatchObject({ status: 'pending' })
    }))

  it('cancels the maker’s pending requests when they are removed', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      await removeMember(w.owner, w.makerMemberId)
      expect(await requestRow(tx, out.requestId)).toMatchObject({
        status: 'cancelled',
        endedReason: 'maker_left',
      })
      const [audit] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, w.org.id),
            eq(auditEvents.action, 'approval.cancelled'),
          ),
        )
      expect(audit).toMatchObject({ actorName: 'Olumide Bankole' })
      expect(audit?.metadata).toMatchObject({ note: 'Cancelled because Ope Martins left' })
    }))
})

describe('approval decisions are append-only', () => {
  it('refuses to update or delete a decision', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await createApprovalRule(tx, w.org, { steps: [['owner']] })
      const out = await ask(tx, w)
      await approve(w.owner, out.requestId)
      await expect(
        tx.transaction((sp) => sp.execute(sql`update approval_decisions set comment = 'edited'`)),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23001' }) })
      await expect(
        tx.transaction((sp) => sp.execute(sql`delete from approval_decisions`)),
      ).rejects.toMatchObject({ cause: expect.objectContaining({ code: '23001' }) })
    }))
})
