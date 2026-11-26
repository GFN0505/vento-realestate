import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { entities, invitations, members, sessions, users } from '@/db/schema'
import { recordDelivery } from '@/modules/invitations/delivery'
import { withRollback } from './db'
import {
  addAddOnRow,
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
  createSession,
  createUser,
  setOverride,
  setStage,
} from './factories'
import { clientAs } from './router-client'

describe('organization isolation', () => {
  it('answers not found for every id from another organization and changes nothing', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      await createEntity(tx, mine)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const theirEntity = await createEntity(tx, theirs, { name: 'Their SPV Ltd' })
      const theirOther = await createEntity(tx, theirs, { name: 'Their Second SPV Ltd' })
      const theirMember = await createMember(tx, theirs, { role: 'sales' })
      const theirInvitation = await createInvitation(tx, theirs, { role: 'viewer' })
      const theirSession = await createSession(tx, theirMember.user)
      const myViewerRole = mine.roleIds.get('viewer') ?? ''
      const theirViewerRole = theirs.roleIds.get('viewer') ?? ''
      const myMember = await createMember(tx, mine, { role: 'sales' })
      const { client } = clientAs(tx, mine.owner)

      const attempts: [string, () => Promise<unknown>][] = [
        ['entities.get', () => client.entities.get({ id: theirEntity.id })],
        [
          'entities.update',
          () => client.entities.update({ id: theirEntity.id, name: 'Hacked Ltd' }),
        ],
        ['entities.archivePreview', () => client.entities.archivePreview({ id: theirEntity.id })],
        ['entities.archive', () => client.entities.archive({ id: theirOther.id })],
        [
          'members.updateAccess (their member)',
          () =>
            client.members.updateAccess({
              memberId: theirMember.member.id,
              roleId: myViewerRole,
              entityIds: null,
            }),
        ],
        [
          'members.updateAccess (their role)',
          () =>
            client.members.updateAccess({
              memberId: myMember.member.id,
              roleId: theirViewerRole,
              entityIds: null,
            }),
        ],
        [
          'members.updateAccess (their entity)',
          () =>
            client.members.updateAccess({
              memberId: myMember.member.id,
              roleId: myViewerRole,
              entityIds: [theirEntity.id],
            }),
        ],
        ['members.remove', () => client.members.remove({ memberId: theirMember.member.id })],
        [
          'members.resetTwoStep',
          () => client.members.resetTwoStep({ memberId: theirMember.member.id }),
        ],
        [
          'invitations.create (their role)',
          () =>
            client.invitations.create({
              items: [{ email: 'x@test.vento.ng', roleId: theirViewerRole }],
              entityIds: null,
            }),
        ],
        [
          'invitations.create (their entity)',
          () =>
            client.invitations.create({
              items: [{ email: 'x@test.vento.ng', roleId: myViewerRole }],
              entityIds: [theirEntity.id],
            }),
        ],
        [
          'invitations.resend',
          () => client.invitations.resend({ id: theirInvitation.invitation.id }),
        ],
        [
          'invitations.withdraw',
          () => client.invitations.withdraw({ id: theirInvitation.invitation.id }),
        ],
        ['account.sessions.revoke', () => client.account.sessions.revoke({ id: theirSession.id })],
      ]
      for (const [name, attempt] of attempts) {
        await expect(attempt(), name).rejects.toMatchObject({ code: 'NOT_FOUND' })
      }

      const [entity] = await tx.select().from(entities).where(eq(entities.id, theirEntity.id))
      expect(entity?.name).toBe('Their SPV Ltd')
      expect(
        (await tx.select().from(entities).where(eq(entities.id, theirOther.id)))[0]?.status,
      ).toBe('active')
      expect(
        (await tx.select().from(members).where(eq(members.id, theirMember.member.id)))[0]?.status,
      ).toBe('active')
      expect(
        (
          await tx
            .select()
            .from(invitations)
            .where(eq(invitations.id, theirInvitation.invitation.id))
        )[0]?.status,
      ).toBe('pending')
      expect(await tx.select().from(sessions).where(eq(sessions.id, theirSession.id))).toHaveLength(
        1,
      )
      expect(
        (await tx.select().from(users).where(eq(users.id, theirMember.user.id)))[0]
          ?.twoStepSetupRequired,
      ).toBe(false)
    }))

  it("lists only this organization's rows", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      await createEntity(tx, mine, { name: 'Mine Ltd' })
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createEntity(tx, theirs, { name: 'Theirs Ltd' })
      await createInvitation(tx, theirs, { role: 'viewer' })
      const { client } = clientAs(tx, mine.owner)
      expect((await client.entities.list({})).items.map((e) => e.name)).toEqual(['Mine Ltd'])
      const team = await client.team.list({})
      expect(team.total).toBe(1)
      expect(team.counts).toEqual({ members: 1, invited: 0, removed: 0 })
      expect((await client.team.list({ show: 'invited' })).total).toBe(0)
      expect((await client.roles.list()).total).toBe(9)
    }))

  it('lists no team rows for a role from another organization, and never their people', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createMember(tx, theirs, { role: 'sales', name: 'Their Sales Person' })
      await createInvitation(tx, theirs, { role: 'sales' })
      const { client } = clientAs(tx, mine.owner)
      const foreignRole = await client.team.list({ roleId: theirs.roleIds.get('sales') ?? '' })
      expect(foreignRole.items).toEqual([])
      const all = await client.team.list({})
      expect(all.items.map((r) => r.id)).toEqual([mine.ownerMemberId])
      expect(JSON.stringify(all)).not.toContain('Their Sales Person')
    }))

  it("ticks the checklist only from this organization's people and entities", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      await createEntity(tx, theirs)
      await createMember(tx, theirs, { role: 'sales' })
      await createInvitation(tx, theirs, { role: 'sales' })
      const { client } = clientAs(tx, mine.owner)
      const { items } = await client.checklist.get()
      expect(items.filter((i) => !i.done).map((i) => i.key)).toEqual([
        'first_entity',
        'other_companies',
        'invite_team',
      ])
    }))

  it("records no delivery on another organization's invitation", () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const { invitation } = await createInvitation(tx, theirs, {
        role: 'sales',
        delivery: 'queued',
      })
      const recorded = await recordDelivery(tx, {
        organizationId: mine.id,
        invitationId: invitation.id,
        sentAt: invitation.lastSentAt,
        result: { status: 'failed', kind: 'rejected' },
      })
      expect(recorded).toBeNull()
      const [row] = await tx.select().from(invitations).where(eq(invitations.id, invitation.id))
      expect(row?.delivery).toBe('queued')
    }))

  it('refuses to switch to another organization and leaves the session where it was', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const session = await createSession(tx, mine.owner, { activeOrganizationId: mine.id })
      const { client } = clientAs(tx, mine.owner, {
        sessionId: session.id,
        activeOrganizationId: mine.id,
      })
      await expect(
        client.account.switchOrganization({ organizationId: theirs.id }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.activeOrganizationId).toBe(mine.id)
      expect(
        (await tx.select().from(users).where(eq(users.id, mine.owner.id)))[0]
          ?.lastActiveOrganizationId,
      ).toBeNull()
    }))

  it('names only people from this organization as access contacts', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const grace = await createMember(tx, mine, { role: 'sales', name: 'Grace Umeh' })
      const theirOwner = await createUser(tx, { name: 'Their Owner', twoFactorEnabled: true })
      const theirs = await createOrganization(tx, {
        name: 'Other Developer Ltd',
        owner: theirOwner,
      })
      await createMember(tx, theirs, { role: 'admin', name: 'Their Admin' })
      const { client } = clientAs(tx, grace.user, { activeOrganizationId: mine.id })
      const result = await client.access.whoCanChangeAccess({ module: 'settings' })
      expect(result.contacts).toEqual([{ name: 'Olumide Bankole', roleName: 'Owner' }])
      expect(JSON.stringify(result)).not.toMatch(/Their (Owner|Admin)/)
    }))

  it('never reads the organization from input', () =>
    withRollback(async (tx) => {
      const mine = await createOrganization(tx)
      const theirs = await createOrganization(tx, { name: 'Other Developer Ltd' })
      const { client } = clientAs(tx, mine.owner)
      const sneaky = {
        name: 'Sneaky Ltd',
        type: 'spv',
        organizationId: theirs.id,
      } as unknown as Parameters<typeof client.entities.create>[0]
      await expect(client.entities.create(sneaky)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }))
})

describe('feature and plan isolation', () => {
  it("never lets one organization's overrides, add-ons or deals reach another", () =>
    withRollback(async (tx) => {
      const a = await createOrganization(tx, { name: 'Org A Ltd', planKey: 'starter' })
      const b = await createOrganization(tx, { name: 'Org B Ltd', planKey: 'starter' })
      await setStage(tx, 'land', 'on')
      await setOverride(tx, a, { kind: 'release', key: 'sales.commissions', enabled: true })
      await setOverride(tx, a, { kind: 'feature', key: 'facility', enabled: true })
      await setOverride(tx, a, { kind: 'release', key: 'facility', enabled: true })
      await setOverride(tx, a, { kind: 'limit', key: 'entities', limitValue: null })
      await addAddOnRow(tx, a)
      await createEntity(tx, b, { name: 'B Holding Ltd', type: 'holding' })
      await createEntity(tx, b, { name: 'B SPV Ltd' })

      const { client } = clientAs(tx, b.owner, { activeOrganizationId: b.id })
      const me = await client.account.me()
      expect(me.features).toEqual([{ key: 'land', earlyAccess: false }])
      expect(me.plan).toMatchObject({ aiBudget: null, upgradeHints: [] })
      await expect(
        client.entities.create({ name: 'B Third Ltd', type: 'spv' }),
      ).rejects.toMatchObject({ data: { reason: 'plan_limit' } })
    }))

  it("gives a person B's features, not internal A's, after switching to B", () =>
    withRollback(async (tx) => {
      const person = await createUser(tx, { name: 'Bisi Lawal', twoFactorEnabled: true })
      const a = await createOrganization(tx, { name: 'Vento Demo Ltd', owner: person })
      const b = await createOrganization(tx, {
        name: 'Lekki Partners Ltd',
        owner: person,
        planKey: 'starter',
      })
      const session = await createSession(tx, person, { activeOrganizationId: a.id })
      const inA = clientAs(tx, person, { sessionId: session.id, activeOrganizationId: a.id })
      expect((await inA.client.account.me()).features.length).toBeGreaterThan(10)
      await inA.client.account.switchOrganization({ organizationId: b.id })
      const inB = clientAs(tx, person, { sessionId: session.id, activeOrganizationId: b.id })
      const me = await inB.client.account.me()
      expect(me.organization).toMatchObject({ id: b.id, internal: false })
      expect(me.features).toEqual([])
    }))
})
