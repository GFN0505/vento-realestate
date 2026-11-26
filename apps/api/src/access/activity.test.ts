import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { members } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createMember, createOrganization } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { throwingDb } from '@/test/throwing-db'
import { touchMemberActivity } from './context'

const MINUTE = 60_000

describe('last active', () => {
  it('reads nothing and writes nothing when the member was active within the hour', async () => {
    const recent = new Date(Date.now() - 30 * MINUTE)
    await expect(
      touchMemberActivity(throwingDb(), { id: 'm', lastActiveAt: recent }),
    ).resolves.toBeUndefined()
  })

  it('writes on the first request after an hour, then not again within the hour', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const twoHoursAgo = new Date(Date.now() - 120 * MINUTE)
      const aisha = await createMember(tx, org, { role: 'admin', lastActiveAt: twoHoursAgo })
      const lastActive = async () =>
        (await tx.select().from(members).where(eq(members.id, aisha.member.id)))[0]?.lastActiveAt
      const { client } = clientAs(tx, aisha.user)

      await client.roles.list()
      const first = await lastActive()
      expect(first?.getTime()).toBeGreaterThan(Date.now() - MINUTE)

      await client.team.list({})
      expect(await lastActive()).toEqual(first)
    }))

  it('counts opening the app (account.me) as activity', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const grace = await createMember(tx, org, { role: 'sales', lastActiveAt: null })
      await clientAs(tx, grace.user).client.account.me()
      const [row] = await tx.select().from(members).where(eq(members.id, grace.member.id))
      expect(row?.lastActiveAt).not.toBeNull()
    }))
})
