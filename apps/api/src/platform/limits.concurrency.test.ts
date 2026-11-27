import { and, count, eq, gt } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { entities, invitations } from '@/db/schema'
import { uniqueEmail, uniqueSuffix } from '@/test/db'
import { createEntity, createMember, createOrganization } from '@/test/factories'
import { clientAs } from '@/test/router-client'

// Real commits on separate pool connections: the only way to prove the row lock serialises
// two creates. Data uses unique names, like the HTTP auth tests (the test database is
// recreated each run).

describe('plan limits under concurrency', () => {
  it('lets exactly one of two simultaneous creates take the last entity place', async () => {
    const org = await createOrganization(db, {
      name: `Race Entities ${uniqueSuffix()}`,
      planKey: 'starter',
    })
    await createEntity(db, org, { name: 'Race Holding Ltd', type: 'holding' })
    const a = clientAs(db, org.owner, { activeOrganizationId: org.id }).client
    const b = clientAs(db, org.owner, { activeOrganizationId: org.id }).client

    const results = await Promise.allSettled([
      a.entities.create({ name: 'Race SPV A Ltd', type: 'spv' }),
      b.entities.create({ name: 'Race SPV B Ltd', type: 'spv' }),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const refused = results.find((r) => r.status === 'rejected')
    expect(refused?.status === 'rejected' && refused.reason).toMatchObject({
      code: 'FORBIDDEN',
      data: { reason: 'plan_limit', limit: 'entities' },
    })
    const [row] = await db
      .select({ n: count() })
      .from(entities)
      .where(and(eq(entities.organizationId, org.id), eq(entities.status, 'active')))
    expect(row?.n).toBe(2)
  })

  it('lets exactly one of two simultaneous invitations take the last place for people', async () => {
    const org = await createOrganization(db, {
      name: `Race People ${uniqueSuffix()}`,
      planKey: 'starter',
    })
    for (let i = 0; i < 8; i++) await createMember(db, org, { role: 'viewer' })
    const viewer = org.roleIds.get('viewer') ?? ''
    const invite = (email: string) =>
      clientAs(db, org.owner, { activeOrganizationId: org.id }).client.invitations.create({
        items: [{ email, roleId: viewer }],
        entityIds: null,
      })

    const results = await Promise.allSettled([
      invite(uniqueEmail('racer')),
      invite(uniqueEmail('racer')),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const [row] = await db
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.organizationId, org.id),
          eq(invitations.status, 'pending'),
          gt(invitations.expiresAt, new Date()),
        ),
      )
    expect(row?.n).toBe(1)
  })
})
