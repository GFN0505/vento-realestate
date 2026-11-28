import { and, desc, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { decide as engineDecide, expireDue } from '@/approvals/engine'
import { StaleError } from '@/approvals/errors'
import { approvalPlugins } from '@/approvals/registry'
import type { DbOrTx } from '@/db/client'
import {
  approvalRequests,
  approvalRules,
  auditEvents,
  encumbrances,
  titleDocuments,
  titleDocumentVersions,
} from '@/db/schema'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { getApproval, listApprovals } from '@/modules/approvals/approvals.service'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createCustomRole,
  createEncumbrance,
  createMember,
  createParcel,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { applyEncumbranceClear } from './encumbrance-clear'
import { type LandWorld, landWorld } from './land.test-world'
import { blockedParcels } from './sales-block'

// land.encumbrance.clear through the real services (plan §6, §11): Ngozi asks, Aisha (Finance)
// approves step 1, Olumide (Owner) step 2, as the default rule says.

async function world(tx: DbOrTx) {
  const w = await landWorld(tx)
  await seedDefaultRules(tx, w.org.id, w.org.ownerMemberId)
  const aisha = await createMember(tx, w.org, { role: 'finance', name: 'Aisha Bello' })
  const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id, status: 'acquired' })
  const enc = await createEncumbrance(tx, w.org, parcel, { recordedBy: w.ngozi.user })
  return { ...w, aisha, parcel, enc }
}

type World = Awaited<ReturnType<typeof world>>

async function ask(w: World, extra: { reason?: string; note?: string } = {}) {
  return w.client.land.encumbrances.requestClear({
    id: w.enc.id,
    expectedVersion: 1,
    clearedOn: '2026-11-20',
    evidence: { fileId: await w.file() },
    reason: 'Family withdrew the caveat',
    ...extra,
  })
}

const decide = (w: LandWorld, user: Parameters<LandWorld['as']>[0], requestId: string) =>
  w.as(user).approvals.decide({ requestId, decision: 'approve' })

async function stateOf(w: World) {
  const [row] = await w.tx.select().from(encumbrances).where(eq(encumbrances.id, w.enc.id))
  const blocked = (await blockedParcels(w.tx, { organizationId: w.org.id }, [w.parcel.id])).has(
    w.parcel.id,
  )
  return { status: row?.status, blocked }
}

async function requestOf(w: World, id: string) {
  const [row] = await w.tx.select().from(approvalRequests).where(eq(approvalRequests.id, id))
  return row
}

async function clearanceDocs(w: World) {
  return w.tx
    .select({ id: titleDocuments.id, name: titleDocuments.name })
    .from(titleDocuments)
    .where(
      and(
        eq(titleDocuments.parcelId, w.parcel.id),
        eq(titleDocuments.type, 'encumbrance_evidence'),
      ),
    )
}

/** The clearance version filed by the latest request (its payload's clearanceVersionId). */
async function clearanceVersion(w: World): Promise<string> {
  const [row] = await w.tx
    .select({ id: titleDocumentVersions.id })
    .from(titleDocumentVersions)
    .innerJoin(titleDocuments, eq(titleDocuments.id, titleDocumentVersions.documentId))
    .where(
      and(
        eq(titleDocuments.parcelId, w.parcel.id),
        eq(titleDocuments.name, 'Clearance · Caveat · CV/LAG/2026/114'),
      ),
    )
    .orderBy(desc(titleDocumentVersions.versionNo))
    .limit(1)
  return row?.id ?? ''
}

describe('land.encumbrance.clear: asking', () => {
  it('waits for approval, files the clearance evidence and changes nothing else', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const sent = await ask(w)
      expect(sent.notice).toBe('Sent to Aisha Bello for approval')
      expect(sent.pendingRequestId).not.toBeNull()
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
      expect(sent.parcel.encumbrances[0]?.pendingClear).toMatchObject({
        requestId: sent.pendingRequestId,
        waitingFor: 'Admin, Land & legal or Finance',
        isOwn: true,
      })
      expect((await clearanceDocs(w)).map((d) => d.name)).toContain(
        'Clearance · Caveat · CV/LAG/2026/114',
      )
      const detail = await w.as(w.aisha.user).approvals.get({ id: sent.pendingRequestId ?? '' })
      expect(detail).toMatchObject({
        title: 'Clear caveat · Plot 22, Folu Ayo',
        canDecide: true,
        approveLabel: 'Clear caveat and unblock sales',
        entity: { id: w.lekki.id },
      })
      const pinned = await clearanceVersion(w)
      expect(detail.summary.changes).toEqual([
        { field: 'Status', before: 'Active', after: 'Cleared' },
        { field: 'Cleared on', before: null, after: '20 Nov 2026' },
        {
          field: 'Evidence',
          before: null,
          // The vault's name, never the uploaded file's (security M3), linking the pinned version.
          after: 'Clearance · Caveat · CV/LAG/2026/114 (v1)',
          link: `/land/${w.parcel.id}?tab=encumbrances&preview=${pinned}`,
        },
        { field: 'Sales on this parcel', before: 'Blocked', after: 'Unblocked' },
      ])
    }))

  it('answers a second request with the one already waiting, saving nothing', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const first = await ask(w)
      const before = await clearanceDocs(w)
      await expect(ask(w)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'approval_pending', requestId: first.pendingRequestId },
      })
      expect(await clearanceDocs(w)).toEqual(before)
    }))

  it('refuses when nobody else could approve, naming the company, and files nothing', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await seedDefaultRules(tx, w.org.id, w.org.ownerMemberId)
      const parcel = await createParcel(tx, w.org, { entityId: w.lekki.id })
      const enc = await createEncumbrance(tx, w.org, parcel)
      await expect(
        w.client.land.encumbrances.requestClear({
          id: enc.id,
          expectedVersion: 1,
          clearedOn: '2026-11-20',
          evidence: { fileId: await w.file() },
          reason: 'Withdrawn',
        }),
      ).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'no_approver' },
        message: `Nobody else can approve this in ${w.lekki.name}. Ask an owner to add an approver to the rule.`,
      })
      const docs = await tx
        .select()
        .from(titleDocuments)
        .where(eq(titleDocuments.parcelId, parcel.id))
      expect(docs).toHaveLength(1)
    }))

  it('refuses without a rule (decision 0026), and the preview says so first', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await tx
        .delete(approvalRules)
        .where(
          and(
            eq(approvalRules.organizationId, w.org.id),
            eq(approvalRules.actionKey, 'land.encumbrance.clear'),
          ),
        )
      const message = `Clearing an encumbrance needs an approval rule for ${w.lekki.name}. Ask an owner to add one in Approval rules.`
      expect(
        await w.client.approvals.preview({
          actionKey: 'land.encumbrance.clear',
          subject: { type: 'encumbrance', id: w.enc.id },
          entityId: w.lekki.id,
        }),
      ).toMatchObject({ needed: true, blocked: message })
      await expect(ask(w)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'no_rule' },
        message,
      })
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
    }))

  it('refuses a clearing date before the date served', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await expect(
        w.client.land.encumbrances.requestClear({
          id: w.enc.id,
          expectedVersion: 1,
          clearedOn: '2026-11-01',
          evidence: { fileId: await w.file() },
          reason: 'x',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'cleared_before_served' },
        message: 'Enter a date on or after 4 Nov 2026.',
      })
    }))
})

describe('land.encumbrance.clear: deciding', () => {
  it('clears and unblocks only on the last approval, audited with the approvers in order', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const sent = await ask(w)
      const id = sent.pendingRequestId ?? ''
      await decide(w, w.aisha.user, id)
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
      const done = await decide(w, w.org.owner, id)
      expect(done.ran).toBe(true)
      expect(await stateOf(w)).toEqual({ status: 'cleared', blocked: false })
      const [event] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, w.org.id),
            eq(auditEvents.action, 'land.encumbrance.cleared'),
          ),
        )
      expect(event).toMatchObject({ actorName: 'Ngozi Adeyemi', targetId: w.parcel.id })
      expect(event?.metadata).toMatchObject({
        encumbranceId: w.enc.id,
        approvalRequestId: id,
        approvedBy: [
          { name: 'Aisha Bello', position: 1 },
          { name: 'Olumide Bankole', position: 2 },
        ],
      })
      const detail = await w.client.land.parcels.get({ id: w.parcel.id })
      expect(detail.encumbrances[0]?.clearance).toMatchObject({
        clearedOn: '2026-11-20',
        approvedBy: ['Aisha Bello', 'Olumide Bankole'],
        file: {
          name: 'Clearance · Caveat · CV/LAG/2026/114',
          version: { id: await clearanceVersion(w) },
        },
      })
    }))

  it('shows the request and both decisions in the parcel’s Activity (plan risk 7)', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const id = (await ask(w)).pendingRequestId ?? ''
      await decide(w, w.aisha.user, id)
      await decide(w, w.org.owner, id)
      const activity = await w.client.land.parcels.activity({ id: w.parcel.id })
      expect(activity.items.map((e) => e.what)).toEqual(
        expect.arrayContaining([
          'Asked for approval: Clear caveat · Plot 22, Folu Ayo',
          'Approved step 1: Clear caveat · Plot 22, Folu Ayo',
          'Approved Clear caveat · Plot 22, Folu Ayo',
          'Cleared the caveat',
        ]),
      )
    }))

  it('never lets the maker approve, nor one person approve two steps', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const id = (await ask(w)).pendingRequestId ?? ''
      await expect(decide(w, w.ngozi.user, id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'own_request' },
      })
      const ope = await createMember(tx, w.org, { role: 'admin', name: 'Ope Martins' })
      await decide(w, ope.user, id)
      await expect(decide(w, ope.user, id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'not_eligible' },
      })
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
    }))

  it('keeps Finance limited to another company out', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const bisi = await createMember(tx, w.org, { role: 'finance', entityIds: [w.parkview.id] })
      const id = (await ask(w)).pendingRequestId ?? ''
      await expect(decide(w, bisi.user, id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('expires as stale, still blocking, when the parcel moved company since the request', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const id = (await ask(w)).pendingRequestId ?? ''
      await decide(w, w.aisha.user, id)
      await w.as(w.org.owner).land.parcels.update({
        id: w.parcel.id,
        expectedVersion: 1,
        entityId: w.parkview.id,
      })
      await expect(decide(w, w.org.owner, id)).rejects.toMatchObject({
        code: 'CONFLICT',
        data: { reason: 'approval_stale' },
      })
      expect(await requestOf(w, id)).toMatchObject({ status: 'expired', endedReason: 'stale' })
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
    }))

  it('keeps the clearance evidence as asked while the request waits: no removal, no new version', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      await ask(w)
      const owner = w.as(w.org.owner)
      await expect(
        owner.land.documents.removeVersion({
          versionId: await clearanceVersion(w),
          reason: 'Wrong letter',
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'evidence_for_encumbrance' } })
      await expect(
        w.client.land.documents.upload({
          parcelId: w.parcel.id,
          type: 'encumbrance_evidence',
          name: 'Clearance · Caveat · CV/LAG/2026/114',
          fileId: await w.file(),
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT', data: { reason: 'clearing_pending' } })
    }))

  it('expires as stale when the clearance evidence was removed since the request', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const sent = await ask(w)
      const id = sent.pendingRequestId ?? ''
      // Past the service (it refuses while the request waits): only a raw write gets here.
      await tx
        .update(titleDocumentVersions)
        .set({ removedAt: new Date(), removedByUserId: w.org.owner.id, removedReason: 'Wrong' })
        .where(eq(titleDocumentVersions.id, await clearanceVersion(w)))
      await decide(w, w.aisha.user, id)
      await expect(decide(w, w.org.owner, id)).rejects.toMatchObject({
        data: { reason: 'approval_stale' },
      })
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
    }))

  it('changes nothing on reject, cancel or expiry; sending again adds a version', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const first = (await ask(w)).pendingRequestId ?? ''
      await w
        .as(w.aisha.user)
        .approvals.decide({ requestId: first, decision: 'reject', comment: 'Need the letter' })
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
      const second = (await ask(w)).pendingRequestId ?? ''
      await w.client.approvals.cancel({ id: second })
      const third = (await ask(w)).pendingRequestId ?? ''
      await expireDue(tx, new Date(Date.now() + 8 * 86_400_000), w.org.id)
      expect(await requestOf(w, third)).toMatchObject({ status: 'expired' })
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
      // One clearance document, a version per request (owner, 28 Nov 2026).
      const docs = (await clearanceDocs(w)).filter((d) => d.name?.startsWith('Clearance'))
      expect(docs.map((d) => d.name)).toEqual(['Clearance · Caveat · CV/LAG/2026/114'])
      const clearance = docs[0]
      const versions = await tx
        .select()
        .from(titleDocumentVersions)
        .where(eq(titleDocumentVersions.documentId, clearance?.id ?? ''))
      expect(versions).toHaveLength(3)
    }))

  it('clears a mortgage that didn’t block without “unblock sales” in its words', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const mortgage = await createEncumbrance(tx, w.org, w.parcel, {
        type: 'mortgage',
        claimant: 'Sterling Bank',
        recordedBy: w.ngozi.user,
      })
      const sent = await w.client.land.encumbrances.requestClear({
        id: mortgage.id,
        expectedVersion: 1,
        clearedOn: '2026-11-20',
        evidence: { fileId: await w.file() },
        reason: 'Facility repaid',
      })
      const detail = await w.as(w.aisha.user).approvals.get({ id: sent.pendingRequestId ?? '' })
      expect(detail.approveLabel).toBe('Clear mortgage')
      expect(detail.summary.changes.map((c) => c.field)).not.toContain('Sales on this parcel')
    }))

  it('lets nothing but the approval clear it: the trigger freezes a cleared one', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const id = (await ask(w)).pendingRequestId ?? ''
      await decide(w, w.aisha.user, id)
      await decide(w, w.org.owner, id)
      const reopen = await tx
        .transaction(async (inner) => {
          await inner
            .update(encumbrances)
            .set({ notes: 'Reopened' })
            .where(eq(encumbrances.id, w.enc.id))
        })
        .catch((e: unknown) => e)
      expect(reopen).toBeInstanceOf(Error)
      expect(await stateOf(w)).toEqual({ status: 'cleared', blocked: false })
    }))
})

describe('land.encumbrance.clear: the plug-in', () => {
  it('previews the default chain for a viewer who can clear', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      expect(
        await clientAs(tx, w.ngozi.user).client.approvals.preview({
          actionKey: 'land.encumbrance.clear',
          subject: { type: 'encumbrance', id: w.enc.id },
          entityId: w.lekki.id,
        }),
      ).toMatchObject({
        needed: true,
        chain: 'Needs approval by Admin, Land & legal or Finance, then Owner.',
        blocked: null,
        pendingRequestId: null,
      })
    }))
})

describe('land.encumbrance.clear: preview takes the company from the record (security M4)', () => {
  it('names the record’s own company, and refuses a company sent that isn’t it', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const lekkiOnly = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.lekki.id],
      })
      await tx
        .delete(approvalRules)
        .where(
          and(
            eq(approvalRules.organizationId, w.org.id),
            eq(approvalRules.actionKey, 'land.encumbrance.clear'),
          ),
        )
      const preview = (entityId?: string) =>
        w.as(lekkiOnly.user).approvals.preview({
          actionKey: 'land.encumbrance.clear',
          subject: { type: 'encumbrance', id: w.enc.id },
          ...(entityId && { entityId }),
        })
      const own = await preview()
      expect(own).toMatchObject({ needed: true })
      expect(JSON.stringify(own)).toContain(w.lekki.name)
      const foreign = await preview(w.parkview.id).catch((e: unknown) => e)
      expect(foreign).toMatchObject({ code: 'NOT_FOUND' })
      expect(JSON.stringify(foreign)).not.toContain(w.parkview.name)
    }))

  it('answers NOT_FOUND for an encumbrance outside the viewer’s companies', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const parkviewOnly = await createMember(tx, w.org, {
        role: 'land_legal',
        entityIds: [w.parkview.id],
      })
      await expect(
        w.as(parkviewOnly.user).approvals.preview({
          actionKey: 'land.encumbrance.clear',
          subject: { type: 'encumbrance', id: w.enc.id },
          entityId: w.parkview.id,
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('needs Land & title create as well as edit (security L5)', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const role = await createCustomRole(tx, w.org, {
        name: 'Title clerk',
        permissions: { land: ['view', 'edit'] },
      })
      const clerk = await createMember(tx, w.org, { role: 'land_legal', roleId: role.id })
      await expect(
        w.as(clerk.user).approvals.preview({
          actionKey: 'land.encumbrance.clear',
          subject: { type: 'encumbrance', id: w.enc.id },
        }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', data: { reason: 'permission' } })
    }))
})

describe('land.encumbrance.clear: a feature the organization lost (security L2)', () => {
  it('refuses to decide (NOT_FOUND) and leaves the request out of the inbox', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const id = (await ask(w)).pendingRequestId ?? ''
      const real = await contextFor(tx, w.aisha.user, w.org)
      const features: typeof real.features = {
        ...real.features,
        has: (key) => key !== 'land' && real.features.has(key),
      }
      const ctx = { ...real, features }
      await expect(
        engineDecide(ctx, { requestId: id, decision: 'approve' }, approvalPlugins()),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const inbox = await listApprovals(ctx, { tab: 'waiting', page: 1, pageSize: 25 })
      expect(inbox).toMatchObject({ items: [], total: 0, waitingCount: 0 })
      await expect(getApproval(ctx, id)).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(await requestOf(w, id)).toMatchObject({ status: 'pending', currentStep: 1 })
      const withLand = await listApprovals(real, { tab: 'waiting', page: 1, pageSize: 25 })
      expect(withLand.total).toBe(1)
    }))
})

describe('land.encumbrance.clear: the executor and expiry', () => {
  it('refuses to clear without an approval request (review #4)', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const ngozi = await contextFor(tx, w.ngozi.user, w.org, w.storage)
      const payload = {
        encumbranceId: w.enc.id,
        version: 1,
        parcelId: w.parcel.id,
        entityId: w.lekki.id,
        clearedOn: '2026-11-20',
        clearanceDocumentId: w.enc.evidenceDocumentId,
        clearanceVersionId: w.enc.evidenceVersionId,
        note: null,
      }
      await expect(
        applyEncumbranceClear(tx, ngozi, payload, {
          approvedBy: [],
          approvalRequestId: null,
          noApprover: true,
        }),
      ).rejects.toBeInstanceOf(StaleError)
      expect(await stateOf(w)).toEqual({ status: 'active', blocked: true })
    }))

  it('lets details change and a new request go once the waiting one is past its 7 days (review #5)', () =>
    withRollback(async (tx) => {
      const w = await world(tx)
      const id = (await ask(w)).pendingRequestId ?? ''
      await tx
        .update(approvalRequests)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(approvalRequests.id, id))
      const detail = await w.client.land.encumbrances.update({
        id: w.enc.id,
        expectedVersion: 1,
        reference: 'CV/LAG/2026/114A',
      })
      expect(detail.encumbrances[0]).toMatchObject({ version: 2, pendingClear: null })
      expect(await requestOf(w, id)).toMatchObject({ status: 'expired', endedReason: 'timeout' })
    }))
})
