import { and, eq, like } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { auditEvents } from '@/db/schema'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { withRollback } from '@/test/db'
import { createMember, createParcel } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { type LandWorld, landWorld, recordCaveat } from './land.test-world'

// Who sees an encumbrance's claimant, lawyer, notes and files (owner, 28 Nov 2026): people who
// can edit Land & title or approve in it. Sales and view-only roles see the type, reference,
// dates, status and the block, everywhere the encumbrance shows. And the audit trail, approval
// summaries and emails never hold those words at all (security M3).

const CLAIMANT = 'Ogunleye family'
const LAWYER = 'Adaeze Okoro'
const NOTES = 'Family says the 1998 sale was never completed'
const CLEARANCE_NOTE = 'Withdrawn after Mr Ogunleye was paid'

async function recorded(w: LandWorld) {
  const parcel = await createParcel(w.tx, w.org, {
    entityId: w.lekki.id,
    name: 'Plot 22, Folu Ayo',
    status: 'acquired',
  })
  const detail = await w.client.land.encumbrances.record(
    recordCaveat(parcel.id, await w.file(), {
      claimant: CLAIMANT,
      lawyer: LAWYER,
      notes: NOTES,
      nextOn: '2026-12-10',
    }),
  )
  const enc = detail.encumbrances[0]
  if (!enc?.evidence) throw new Error('recorded without evidence')
  return { parcel, enc, evidence: enc.evidence }
}

describe('encumbrance details by role', () => {
  it('shows Sales the type, reference, dates and block, never who, the lawyer, notes or files', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const { parcel } = await recorded(w)
      const sales = w.as((await createMember(tx, w.org, { role: 'sales' })).user)
      const detail = await sales.land.parcels.get({ id: parcel.id })
      expect(detail.encumbrances[0]).toMatchObject({
        type: 'caveat',
        reference: 'CV/LAG/2026/114',
        servedOn: '2026-11-04',
        nextOn: '2026-12-10',
        status: 'active',
        blocksSales: true,
        detailsHidden: true,
        claimant: null,
        lawyer: null,
        notes: null,
        evidence: null,
      })
      expect(detail.encumbrance?.top.claimant).toBeNull()
      expect(detail.documents.map((d) => d.type)).not.toContain('encumbrance_evidence')
      const [row] = (await sales.land.parcels.list({ filter: 'encumbered' })).items
      expect(row?.encumbrance?.top).toEqual({ type: 'caveat', blocksSales: true, claimant: null })
      const home = await sales.land.home({})
      expect(home.encumbrances.active[0]).toMatchObject({
        reference: 'CV/LAG/2026/114',
        claimant: null,
      })
      expect(JSON.stringify([detail, row, home])).not.toContain('Ogunleye')
    }))

  it('shows Finance (Approve) and Land & legal every detail and the evidence', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const { parcel, evidence } = await recorded(w)
      const finance = w.as((await createMember(tx, w.org, { role: 'finance' })).user)
      const detail = await finance.land.parcels.get({ id: parcel.id })
      expect(detail.encumbrances[0]).toMatchObject({
        detailsHidden: false,
        claimant: CLAIMANT,
        lawyer: LAWYER,
        notes: NOTES,
        evidence: { documentId: evidence.documentId, version: { id: evidence.version.id } },
      })
      expect((await w.client.land.home({})).encumbrances.active[0]?.claimant).toBe(CLAIMANT)
    }))

  it('answers NOT_FOUND to versions, links and removals of evidence for view-only roles', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const { evidence } = await recorded(w)
      const viewer = w.as((await createMember(tx, w.org, { role: 'viewer' })).user)
      const notFound = { code: 'NOT_FOUND' }
      await expect(
        viewer.land.documents.versions({ documentId: evidence.documentId }),
      ).rejects.toMatchObject(notFound)
      await expect(
        viewer.land.documents.link({ versionId: evidence.version.id, disposition: 'inline' }),
      ).rejects.toMatchObject(notFound)
      const finance = w.as((await createMember(tx, w.org, { role: 'finance' })).user)
      const versions = await finance.land.documents.versions({ documentId: evidence.documentId })
      expect(versions.map((v) => v.id)).toEqual([evidence.version.id])
    }))

  it('strips the markers from Activity for Sales, and hides edits of only those fields', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      const { parcel, enc } = await recorded(w)
      await w.client.land.encumbrances.update({ id: enc.id, expectedVersion: 1, lawyer: 'Other' })
      const sales = w.as((await createMember(tx, w.org, { role: 'sales' })).user)
      const forSales = await sales.land.parcels.activity({ id: parcel.id })
      const salesActions = forSales.items.map((i) => i.action)
      expect(salesActions).toContain('land.encumbrance.recorded')
      expect(salesActions).not.toContain('land.encumbrance.updated')
      const fields = forSales.items.flatMap((i) => i.changes.map((c) => c.label))
      expect(fields.join(' ')).not.toMatch(/claimant|lawyer|notes/i)
      const forNgozi = await w.client.land.parcels.activity({ id: parcel.id })
      expect(forNgozi.items.map((i) => i.action)).toContain('land.encumbrance.updated')
      const ngoziFields = forNgozi.items.flatMap((i) => i.changes.map((c) => c.label))
      expect(ngoziFields).toEqual(expect.arrayContaining(['Claimant or holder', 'Lawyer']))
    }))
})

describe('the audit trail, summaries and emails keep no claimant or notes (security M3)', () => {
  it('writes only markers, and the approval email and summary say "Note added"', () =>
    withRollback(async (tx) => {
      const w = await landWorld(tx)
      await seedDefaultRules(tx, w.org.id, w.org.ownerMemberId)
      const aisha = await createMember(tx, w.org, { role: 'finance', name: 'Aisha Bello' })
      const { enc } = await recorded(w)
      await w.client.land.encumbrances.update({
        id: enc.id,
        expectedVersion: 1,
        claimant: 'Ogunleye family of Ibeju',
        notes: 'Now in court',
      })
      const { client, mailer } = clientAs(tx, w.ngozi.user, { storage: w.storage })
      const sent = await client.land.encumbrances.requestClear({
        id: enc.id,
        expectedVersion: 2,
        clearedOn: '2026-11-20',
        evidence: { fileId: await w.file() },
        note: CLEARANCE_NOTE,
        reason: 'Withdrawn',
      })
      const events = await tx
        .select({
          action: auditEvents.action,
          before: auditEvents.before,
          after: auditEvents.after,
        })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, w.org.id),
            like(auditEvents.action, 'land.encumbrance.%'),
          ),
        )
      expect(events.map((e) => e.action).sort()).toEqual([
        'land.encumbrance.recorded',
        'land.encumbrance.updated',
      ])
      const trail = JSON.stringify(events)
      for (const words of ['Ogunleye', LAWYER, NOTES, 'Now in court']) {
        expect(trail).not.toContain(words)
      }
      expect(events[0]?.after).toMatchObject({ claimant: '(recorded)' })
      const detail = await w.as(aisha.user).approvals.get({ id: sent.pendingRequestId ?? '' })
      expect(detail.summary.changes).toContainEqual({
        field: 'Note',
        before: null,
        after: 'Note added',
      })
      expect(JSON.stringify(detail)).not.toContain('Mr Ogunleye')
      const emails = mailer.messages
      expect(emails.length).toBeGreaterThan(0)
      expect(JSON.stringify(emails)).not.toContain('Mr Ogunleye')
    }))
})
