import { listTeamInput, type TeamInvitationRow, type TeamMemberRow } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { removeMember } from '@/modules/members/members.service'
import { countingDb } from '@/test/counting-db'
import { withRollback } from '@/test/db'
import {
  contextFor,
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
  createUser,
  type TestOrg,
} from '@/test/factories'
import { likePattern, listTeam } from './team.service'

const MINUTE = 60_000
const list = (ctx: ServiceContext, input: Record<string, unknown> = {}) =>
  listTeam(ctx, listTeamInput.parse(input))
const memberNamed = (rows: Awaited<ReturnType<typeof list>>['items'], name: string) =>
  rows.find((r): r is TeamMemberRow => r.kind === 'member' && r.name === name)

async function team(tx: DbOrTx): Promise<TestOrg> {
  const org = await createOrganization(tx)
  await createMember(tx, org, { role: 'sales', name: 'chidi Okafor' })
  await createMember(tx, org, { role: 'finance', name: 'Bisi Lawal' })
  await createInvitation(tx, org, {
    role: 'viewer',
    email: 'older@ventohomes.ng',
    lastSentAt: new Date(Date.now() - 30 * MINUTE),
  })
  await createInvitation(tx, org, {
    role: 'sales',
    email: 'newer@ventohomes.ng',
    lastSentAt: new Date(Date.now() - 5 * MINUTE),
  })
  return org
}

describe('team.list', () => {
  it('lists owners first, then members A–Z, then open invitations newest sent first', () =>
    withRollback(async (tx) => {
      const org = await team(tx)
      await createMember(tx, org, { role: 'owner', name: 'Zainab Yusuf' })
      const { items, total } = await list(await contextFor(tx, org.owner, org))
      expect(items.map((r) => (r.kind === 'invitation' ? r.email : r.name))).toEqual([
        'Olumide Bankole',
        'Zainab Yusuf',
        'Bisi Lawal',
        'chidi Okafor',
        'newer@ventohomes.ng',
        'older@ventohomes.ng',
      ])
      expect(total).toBe(6)
    }))

  it('filters by chip, search and role, and keeps the counts organization-wide', () =>
    withRollback(async (tx) => {
      const org = await team(tx)
      const ctx = await contextFor(tx, org.owner, org)
      const invited = await list(ctx, { show: 'invited' })
      expect(invited.items.every((r) => r.kind === 'invitation')).toBe(true)
      expect((await list(ctx, { q: 'BISI' })).items.map((r) => r.id)).toHaveLength(1)
      expect((await list(ctx, { q: 'newer@' })).total).toBe(1)
      const sales = await list(ctx, { roleId: org.roleIds.get('sales') })
      expect(sales.total).toBe(2)
      expect(sales.counts).toEqual({ members: 3, invited: 2, removed: 0 })
    }))

  it('treats % and _ in the search as plain characters', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createMember(tx, org, { role: 'sales', name: 'Ada 100% Okafor' })
      const ctx = await contextFor(tx, org.owner, org)
      expect((await list(ctx, { q: '100%' })).total).toBe(1)
      expect((await list(ctx, { q: '%' })).total).toBe(1)
      expect((await list(ctx, { q: '_' })).total).toBe(0)
      expect(likePattern('a_b%c\\')).toBe('%a\\_b\\%c\\\\%')
    }))

  it('shows removed people with who removed them, latest first, leaving out those back again', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const grace = await createMember(tx, org, { role: 'sales', name: 'Grace Umeh' })
      const kunle = await createMember(tx, org, { role: 'project_manager', name: 'Kunle Ojo' })
      const ctx = await contextFor(tx, org.owner, org)
      await removeMember(ctx, grace.member.id)
      await removeMember(ctx, kunle.member.id)
      await createMember(tx, org, { role: 'sales', user: kunle.user })
      const removed = await list(ctx, { show: 'removed' })
      expect(removed.items).toEqual([
        expect.objectContaining({
          kind: 'removed',
          name: 'Grace Umeh',
          role: expect.objectContaining({ name: 'Sales' }),
          removedByName: 'Olumide Bankole',
        }),
      ])
      expect(removed.counts.removed).toBe(1)
    }))

  it('reads a lapsed invitation as expired and a send stuck in the queue as failed', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await createInvitation(tx, org, {
        role: 'sales',
        email: 'lapsed@ventohomes.ng',
        expiresAt: new Date(Date.now() - MINUTE),
      })
      await createInvitation(tx, org, {
        role: 'sales',
        email: 'stuck@ventohomes.ng',
        delivery: 'queued',
        lastSentAt: new Date(Date.now() - 11 * MINUTE),
      })
      const { items } = await list(await contextFor(tx, org.owner, org), { show: 'invited' })
      const byEmail = Object.fromEntries(
        (items as TeamInvitationRow[]).map((r) => [r.email, [r.status, r.delivery]]),
      )
      expect(byEmail).toEqual({
        'lapsed@ventohomes.ng': ['expired', 'sent'],
        'stuck@ventohomes.ng': ['pending', 'failed'],
      })
    }))

  it("shows a limited admin only their entities' names, and makes wider rows read-only", () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
      const admin = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      await createMember(tx, org, {
        role: 'sales',
        name: 'Aisha Bello',
        entityIds: [parkview.id, lekki.id],
      })
      await createMember(tx, org, { role: 'sales', name: 'Kunle Ojo', entityIds: [parkview.id] })
      const result = await list(await contextFor(tx, admin.user, org))
      const aisha = memberNamed(result.items, 'Aisha Bello')
      expect(aisha?.access).toEqual({
        kind: 'some',
        entities: [{ id: parkview.id, name: 'Parkview Residences SPV Ltd' }],
        hiddenCount: 1,
      })
      expect(aisha?.readOnly).toEqual({
        reason: 'wider_access',
        message:
          "Aisha Bello has access to entities you can't see. Ask Olumide Bankole (owner) to change it.",
      })
      expect(memberNamed(result.items, 'Kunle Ojo')?.can.changeAccess).toBe(true)
      expect(JSON.stringify(result)).not.toContain('Lekki')
    }))

  it('derives two-step in all four states and marks own and owner rows', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const admin = await createMember(tx, org, { role: 'admin', name: 'Kemi Admin' })
      const off = await createUser(tx, { name: 'Off Person' })
      const setup = await createUser(tx, { name: 'Setup Person' })
      const reset = await createUser(tx, { name: 'Reset Person', passwordResetRequired: true })
      await createMember(tx, org, { role: 'sales', user: off })
      await createMember(tx, org, { role: 'finance', user: setup })
      await createMember(tx, org, { role: 'sales', user: reset })
      const { items } = await list(await contextFor(tx, admin.user, org))
      const state = (name: string) => memberNamed(items, name)?.twoStep
      expect([state('Kemi Admin'), state('Off Person'), state('Setup Person')]).toEqual([
        'on',
        'off',
        'setup_required',
      ])
      expect(state('Reset Person')).toBe('reset_pending')
      expect(memberNamed(items, 'Kemi Admin')).toMatchObject({
        isYou: true,
        readOnly: { reason: 'self' },
      })
      expect(memberNamed(items, 'Olumide Bankole')?.readOnly?.reason).toBe('owner')
      expect(memberNamed(items, 'Off Person')?.can).toEqual({
        changeAccess: true,
        resetTwoStep: false,
        remove: true,
      })
    }))

  it('pages with the shared shape and runs the same number of queries for any page size', () =>
    withRollback(async (tx) => {
      const org = await team(tx)
      const parkview = await createEntity(tx, org)
      await createMember(tx, org, { role: 'sales', name: 'Dayo Limited', entityIds: [parkview.id] })
      const ctx = await contextFor(tx, org.owner, org)
      const queries = async (pageSize: number) => {
        const { db, calls } = countingDb(tx)
        await list({ ...ctx, db }, { pageSize })
        return calls.length
      }
      expect(await queries(2)).toBe(await queries(50))
      const page2 = await list(ctx, { pageSize: 2, page: 2 })
      expect(page2).toMatchObject({ page: 2, pageSize: 2, total: 6 })
      expect(page2.items).toHaveLength(2)
    }))
})
