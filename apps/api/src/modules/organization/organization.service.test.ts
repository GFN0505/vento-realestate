import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { auditEvents, organizations } from '@/db/schema'
import { uniqueEmail, withRollback } from '@/test/db'
import { contextFor, createEntity, createMember, createOrganization } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { answerSingleCompany, updateOrganization } from './organization.service'

const updates = (tx: Parameters<Parameters<typeof withRollback>[0]>[0], orgId: string) =>
  tx
    .select()
    .from(auditEvents)
    .where(
      and(eq(auditEvents.organizationId, orgId), eq(auditEvents.action, 'organization.updated')),
    )

describe('organization profile', () => {
  it('saves and audits only the fields that changed', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ctx = await contextFor(tx, org.owner, org)
      await updateOrganization(ctx, {
        name: 'Vento Homes Ltd',
        financialYearStartMonth: 4,
        headOfficeState: 'Lagos',
      })
      const [event] = await updates(tx, org.id)
      expect(event?.before).toEqual({ financialYearStartMonth: 1 })
      expect(event?.after).toEqual({ financialYearStartMonth: 4 })
    }))

  it('refuses an admin limited to one company', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const kunle = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      await expect(
        clientAs(tx, kunle.user).client.organization.update({ name: 'Mine Ltd' }),
      ).rejects.toMatchObject({
        data: { reason: 'all_entities_required' },
        message:
          'Only people with access to every company can change this. Ask Olumide Bankole (owner).',
      })
      expect(await updates(tx, org.id)).toEqual([])
    }))

  it('records "We only have one company" with who and when, and Undo clears both', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const ctx = await contextFor(tx, org.owner, org)
      await answerSingleCompany(ctx, true)
      await answerSingleCompany(ctx, true)
      const [set] = await tx.select().from(organizations).where(eq(organizations.id, org.id))
      expect(set?.singleCompanyConfirmedByUserId).toBe(org.owner.id)
      expect(set?.singleCompanyConfirmedAt).not.toBeNull()
      await answerSingleCompany(ctx, false)
      const [cleared] = await tx.select().from(organizations).where(eq(organizations.id, org.id))
      expect(cleared).toMatchObject({
        singleCompanyConfirmedAt: null,
        singleCompanyConfirmedByUserId: null,
      })
      const events = await updates(tx, org.id)
      expect(events.map((e) => e.after)).toEqual([
        { singleCompanyConfirmed: true },
        { singleCompanyConfirmed: false },
      ])
    }))

  it('refuses the one-company answer to an admin limited to one company', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const kunle = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      await expect(
        clientAs(tx, kunle.user).client.checklist.answerSingleCompany({ singleCompany: true }),
      ).rejects.toMatchObject({ data: { reason: 'all_entities_required' } })
    }))
})

describe('organization profile under concurrency', () => {
  it('keeps both of two simultaneous saves of different fields', async () => {
    const org = await createOrganization(db, { name: `Race Org ${uniqueEmail('o')}`.slice(0, 60) })
    const admin = await createMember(db, org, { role: 'admin' })
    const client = (user: typeof org.owner) =>
      clientAs(db, user, { activeOrganizationId: org.id }).client
    await Promise.all([
      client(org.owner).organization.update({ financialYearStartMonth: 7 }),
      client(admin.user).organization.update({ headOfficeState: 'Ogun' }),
    ])
    const [row] = await db.select().from(organizations).where(eq(organizations.id, org.id))
    expect(row).toMatchObject({ financialYearStartMonth: 7, headOfficeState: 'Ogun' })
  })
})
