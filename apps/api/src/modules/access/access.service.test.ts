import { DEFAULT_ROLES, whoCanChangeAccessOutput } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { members } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createMember, createOrganization, createUser, type TestOrg } from '@/test/factories'
import { clientAs } from '@/test/router-client'

async function joinedOn(tx: DbOrTx, memberId: string, day: string) {
  await tx
    .update(members)
    .set({ joinedAt: new Date(`${day}T09:00:00Z`) })
    .where(eq(members.id, memberId))
}

/** Olumide (owner, first), Ngozi (admin), Bisi (owner, later), a removed owner, and Grace (sales). */
async function team(tx: DbOrTx) {
  const org = await createOrganization(tx)
  await joinedOn(tx, org.ownerMemberId, '2026-01-05')
  const ngozi = await createMember(tx, org, { role: 'admin', name: 'Ngozi Adeyemi' })
  await joinedOn(tx, ngozi.member.id, '2026-02-01')
  const bisi = await createMember(tx, org, { role: 'owner', name: 'Bisi Lawal' })
  await joinedOn(tx, bisi.member.id, '2026-03-01')
  const removed = await createMember(tx, org, { role: 'owner', name: 'Femi Removed' })
  await joinedOn(tx, removed.member.id, '2025-12-01')
  await tx
    .update(members)
    .set({ status: 'removed', removedAt: new Date() })
    .where(eq(members.id, removed.member.id))
  const grace = await createMember(tx, org, { role: 'sales', name: 'Grace Umeh' })
  return { org, ngozi, bisi, grace }
}

function ask(tx: DbOrTx, org: TestOrg, user: TestOrg['owner']) {
  return clientAs(tx, user, { activeOrganizationId: org.id }).client.access.whoCanChangeAccess
}

describe('access.whoCanChangeAccess', () => {
  it('names the roles that can view HR & payroll, in system order', () =>
    withRollback(async (tx) => {
      const { org, grace } = await team(tx)
      const result = await ask(tx, org, grace.user)({ module: 'hr' })
      expect(result.roles).toEqual(['owners', 'admins', 'finance staff', 'HR staff'])
    }))

  it('matches the default role table for every module', () =>
    withRollback(async (tx) => {
      const { org, grace } = await team(tx)
      const result = await ask(tx, org, grace.user)({ module: 'land' })
      const expected = DEFAULT_ROLES.filter((r) => r.levels.land !== 'none').map(
        (r) => r.pluralName,
      )
      expect(result.roles).toEqual(expected)
    }))

  it('names up to two people, owners first then longest-standing, skipping removed members', () =>
    withRollback(async (tx) => {
      const { org, grace } = await team(tx)
      const result = await ask(tx, org, grace.user)({ module: 'hr' })
      expect(result.contacts).toEqual([
        { name: 'Olumide Bankole', roleName: 'Owner' },
        { name: 'Bisi Lawal', roleName: 'Owner' },
      ])
    }))

  it('never names the person asking', () =>
    withRollback(async (tx) => {
      const { org } = await team(tx)
      const result = await ask(tx, org, org.owner)({ module: 'hr' })
      expect(result.contacts).toEqual([
        { name: 'Bisi Lawal', roleName: 'Owner' },
        { name: 'Ngozi Adeyemi', roleName: 'Admin' },
      ])
    }))

  it('never names a member of another organization', () =>
    withRollback(async (tx) => {
      const { org, grace } = await team(tx)
      const outsider = await createUser(tx, { name: 'Chidi Outsider', twoFactorEnabled: true })
      const other = await createOrganization(tx, { owner: outsider })
      await joinedOn(tx, other.ownerMemberId, '2020-01-01')
      const result = await ask(tx, org, grace.user)({ module: 'hr' })
      expect(result.contacts.map((c) => c.name)).not.toContain(other.owner.name)
      expect(result.contacts[0]).toEqual({ name: 'Olumide Bankole', roleName: 'Owner' })
    }))

  it('returns names and roles only, never an email', () =>
    withRollback(async (tx) => {
      const { org, grace } = await team(tx)
      const result = await ask(tx, org, grace.user)({ module: 'finance' })
      expect(whoCanChangeAccessOutput.strict().safeParse(result).success).toBe(true)
      for (const contact of result.contacts)
        expect(Object.keys(contact).sort()).toEqual(['name', 'roleName'])
      expect(JSON.stringify(result)).not.toContain('@')
    }))

  it('is open to every role, even one that cannot view the module', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const viewer = await createMember(tx, org, { role: 'viewer' })
      const result = await ask(tx, org, viewer.user)({ module: 'settings' })
      expect(result.roles).toEqual(['owners', 'admins'])
    }))
})
