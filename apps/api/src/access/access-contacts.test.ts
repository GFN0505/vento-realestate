import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { members } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createMember, createOrganization, createUser } from '@/test/factories'
import { accessContacts } from './access-contacts'
import { whoCanGrant } from './who-can-grant'

async function joinedOn(tx: DbOrTx, memberId: string, day: string) {
  await tx
    .update(members)
    .set({ joinedAt: new Date(`${day}T09:00:00Z`) })
    .where(eq(members.id, memberId))
}

/** Olumide (owner, first), Ngozi (admin, second), Bisi (owner, third). */
async function team(tx: DbOrTx) {
  const org = await createOrganization(tx)
  await joinedOn(tx, org.ownerMemberId, '2026-01-05')
  const ngozi = await createMember(tx, org, { role: 'admin', name: 'Ngozi Adeyemi' })
  await joinedOn(tx, ngozi.member.id, '2026-02-01')
  const bisi = await createMember(tx, org, { role: 'owner', name: 'Bisi Lawal' })
  await joinedOn(tx, bisi.member.id, '2026-03-01')
  return { org, ngozi, bisi }
}

describe('accessContacts', () => {
  it('ranks owners before a longer-standing admin, and excludes the caller', () =>
    withRollback(async (tx) => {
      const { org } = await team(tx)
      const contacts = await accessContacts(tx, {
        organizationId: org.id,
        module: 'settings',
        action: 'edit',
        excludeUserId: org.owner.id,
        limit: 5,
      })
      expect(contacts).toEqual([
        { name: 'Bisi Lawal', roleName: 'Owner' },
        { name: 'Ngozi Adeyemi', roleName: 'Admin' },
      ])
    }))

  it('never names a member of another organization', () =>
    withRollback(async (tx) => {
      const { org } = await team(tx)
      const outsider = await createUser(tx, { name: 'Chidi Outsider', twoFactorEnabled: true })
      const other = await createOrganization(tx, { owner: outsider })
      await joinedOn(tx, other.ownerMemberId, '2020-01-01')
      const contacts = await accessContacts(tx, {
        organizationId: org.id,
        module: 'settings',
        action: 'edit',
        excludeUserId: org.owner.id,
        limit: 5,
      })
      expect(contacts.map((c) => c.name)).not.toContain(other.owner.name)
      expect(contacts).toHaveLength(2)
    }))
})

describe('whoCanGrant', () => {
  it('asks the same person accessContacts ranks first', () =>
    withRollback(async (tx) => {
      const { org } = await team(tx)
      const advice = await whoCanGrant(tx, {
        organizationId: org.id,
        module: 'settings',
        action: 'edit',
        doing: 'invite people',
        excludeUserId: org.owner.id,
      })
      expect(advice).toEqual({
        message: 'Only owners and admins can invite people. Ask Bisi Lawal (owner).',
        askName: 'Bisi Lawal',
        askRole: 'owner',
      })
    }))

  it('only asks members of the caller’s organization', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const outsider = await createUser(tx, { name: 'Chidi Outsider', twoFactorEnabled: true })
      const other = await createOrganization(tx, { owner: outsider })
      const advice = await whoCanGrant(tx, {
        organizationId: org.id,
        module: 'settings',
        action: 'edit',
        doing: 'invite people',
        excludeUserId: org.owner.id,
      })
      expect(advice).toEqual({ message: 'Only owners and admins can invite people.' })
      expect(advice.message).not.toContain(other.owner.name)
    }))
})
