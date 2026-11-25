import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { entities, invitations, members, sessions, users } from '@/db/schema'
import { withRollback } from './db'
import {
  createEntity,
  createInvitation,
  createMember,
  createOrganization,
  createSession,
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
      expect((await client.members.list({})).total).toBe(1)
      expect((await client.invitations.list({})).total).toBe(0)
      expect((await client.roles.list()).total).toBe(9)
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
