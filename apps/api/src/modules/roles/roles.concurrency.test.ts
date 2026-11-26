import { MAX_CUSTOM_ROLES } from '@vento/shared'
import { and, count, eq, isNull } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { roles } from '@/db/schema'
import { uniqueEmail } from '@/test/db'
import { createCustomRole, createMember, createOrganization, type TestOrg } from '@/test/factories'
import { clientAs } from '@/test/router-client'

// Real commits on separate pool connections: the only way to prove the locks serialise two
// requests. Data uses unique names (the test database is recreated each run).

const fresh = (label: string) =>
  createOrganization(db, { name: `Race ${label} ${uniqueEmail('o')}`.slice(0, 80) })
const client = (org: TestOrg, user = org.owner) =>
  clientAs(db, user, { activeOrganizationId: org.id }).client

const reasons = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) =>
    r.status === 'fulfilled'
      ? 'ok'
      : ((r.reason as { data?: { reason?: string } }).data?.reason ?? 'error'),
  )

describe('roles under concurrency', () => {
  it('lets one of an assignment and a delete win; the other is refused', async () => {
    const org = await fresh('Assign')
    const site = await createCustomRole(db, org, { permissions: { projects: ['view'] } })
    const grace = await createMember(db, org, { role: 'viewer' })
    const admin = await createMember(db, org, { role: 'admin' })
    const results = await Promise.allSettled([
      client(org).members.updateAccess({
        memberId: grace.member.id,
        roleId: site.id,
        entityIds: null,
      }),
      client(org, admin.user).roles.delete({ id: site.id }),
    ])
    const outcome = reasons(results).sort()
    expect([
      ['ok', 'role_in_use'],
      ['ok', 'role_unavailable'],
    ]).toContainEqual(outcome)
  })

  it('refuses the second of two saves made from the same version', async () => {
    const org = await fresh('Save')
    const site = await createCustomRole(db, org, { permissions: { projects: ['view'] } })
    const admin = await createMember(db, org, { role: 'admin', name: 'Aisha Bello' })
    const results = await Promise.allSettled([
      client(org).roles.update({ id: site.id, version: 1, description: 'Owner wrote this' }),
      client(org, admin.user).roles.update({ id: site.id, version: 1, description: 'Admin' }),
    ])
    expect(reasons(results).sort()).toEqual(['ok', 'role_changed'])
  })

  it(`lets only one of two creates take the ${MAX_CUSTOM_ROLES}th custom role`, async () => {
    const org = await fresh('Create')
    for (let i = 0; i < MAX_CUSTOM_ROLES - 1; i++) {
      await createCustomRole(db, org, { name: `Role ${i}`, permissions: { land: ['view'] } })
    }
    const viewer = org.roleIds.get('viewer') ?? ''
    const admin = await createMember(db, org, { role: 'admin' })
    const results = await Promise.allSettled([
      client(org).roles.create({ name: 'Last A', sourceRoleId: viewer }),
      client(org, admin.user).roles.create({ name: 'Last B', sourceRoleId: viewer }),
    ])
    expect(reasons(results).sort()).toEqual(['ok', 'role_limit'])
    const [row] = await db
      .select({ n: count() })
      .from(roles)
      .where(and(eq(roles.organizationId, org.id), isNull(roles.key), isNull(roles.archivedAt)))
    expect(row?.n).toBe(MAX_CUSTOM_ROLES)
  })
})
