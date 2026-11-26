import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { members } from '@/db/schema'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
} from '@/test/factories'
import { getChecklist, hideChecklist, showChecklist } from './checklist.service'
import { CHECKLIST_ITEMS, type ChecklistEntry, evaluateChecklist } from './items'

const DAY = 24 * 3600_000
const alwaysOpen: ChecklistEntry = {
  key: 'invite_team',
  feature: null,
  check: () => ({ done: false, detail: null }),
}

describe('setup checklist', () => {
  it('starts a new owner at 2 of 4, from data alone', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const checklist = await getChecklist(await contextFor(tx, org.owner, org))
      expect(checklist).toEqual({
        shown: true,
        hidden: false,
        allDone: false,
        items: [
          { key: 'organization', done: true, detail: 'Vento Homes Ltd' },
          { key: 'first_entity', done: false, detail: null },
          { key: 'two_step', done: true, detail: 'On for you' },
          { key: 'invite_team', done: false, detail: null },
        ],
      })
    }))

  it('ticks the entity and the team from what exists', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      await createInvitation(tx, org, { role: 'sales' })
      const ctx = await contextFor(tx, org.owner, org)
      const invited = await getChecklist(ctx)
      expect(invited.items.slice(1, 2)).toEqual([
        { key: 'first_entity', done: true, detail: 'Parkview Residences SPV Ltd' },
      ])
      expect(invited.items.at(-1)).toEqual({
        key: 'invite_team',
        done: true,
        detail: '1 person invited',
      })
      await createMember(tx, org, { role: 'finance', name: 'Aisha Bello' })
      expect((await getChecklist(ctx)).items.at(-1)?.detail).toBe('Aisha Bello joined')
    }))

  it('hides for this person and comes back from ⌘K', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const admin = await createMember(tx, org, { role: 'admin' })
      const ctx = await contextFor(tx, org.owner, org)
      expect(await hideChecklist(ctx)).toEqual({ notice: 'Checklist hidden' })
      expect(await getChecklist(ctx)).toMatchObject({ shown: false, hidden: true })
      expect(await getChecklist(await contextFor(tx, admin.user, org))).toMatchObject({
        shown: true,
      })
      await showChecklist(ctx)
      expect(await getChecklist(ctx)).toMatchObject({ shown: true, hidden: false })
    }))

  it('shows "all done" for the rest of the day, then goes the next Lagos day', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      await createMember(tx, org, { role: 'sales' })
      const ctx = await contextFor(tx, org.owner, org)
      // 10:00 Lagos; 23:30 UTC the same evening is already the next day in Lagos.
      const morning = new Date('2026-11-26T09:00:00Z')
      expect(await getChecklist(ctx, morning)).toMatchObject({ shown: true, allDone: true })
      expect(await getChecklist(ctx, new Date('2026-11-26T22:30:00Z'))).toMatchObject({
        shown: true,
      })
      expect(await getChecklist(ctx, new Date('2026-11-26T23:30:00Z'))).toMatchObject({
        shown: false,
        allDone: true,
      })
    }))

  it('brings the card back when a new item opens, unless the person hid it', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createEntity(tx, org)
      await createMember(tx, org, { role: 'sales' })
      const ctx = await contextFor(tx, org.owner, org)
      await getChecklist(ctx, new Date(Date.now() - 2 * DAY))
      const later = [...CHECKLIST_ITEMS, alwaysOpen]
      expect(await getChecklist(ctx, new Date(), later)).toMatchObject({ shown: true })
      const [row] = await tx.select().from(members).where(eq(members.id, ctx.member.id))
      expect(row?.checklistCompletedAt).toBeNull()
      await hideChecklist(ctx)
      expect(await getChecklist(ctx, new Date(), later)).toMatchObject({ shown: false })
    }))

  it('leaves out items whose feature the organization does not have', () => {
    const gated: ChecklistEntry = { ...alwaysOpen, feature: 'sales' }
    const facts = {
      organizationName: 'Vento Homes Ltd',
      firstEntityName: null,
      viewerTwoStepOn: true,
      otherMembers: 0,
      firstOtherName: null,
      invitedPeople: 0,
    }
    expect(evaluateChecklist([gated], () => false, facts)).toEqual([])
    expect(evaluateChecklist([gated], () => true, facts)).toHaveLength(1)
  })
})
