import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { roles } from '@/db/schema'
import { withRollback } from '@/test/db'
import { createCustomRole, createOrganization } from '@/test/factories'
import { syncSystemRoles } from './system-roles'

describe('syncSystemRoles', () => {
  it('is idempotent and leaves custom roles alone', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const site = await createCustomRole(tx, org, { permissions: { projects: ['view'] } })
      const again = await syncSystemRoles(tx, org.id)
      expect([...again.values()].sort()).toEqual([...org.roleIds.values()].sort())
      const [row] = await tx.select().from(roles).where(eq(roles.id, site.id))
      expect(row?.name).toBe('Site engineer')
    }))

  // Risk R4: a brick that adds a built-in must rename clashing custom roles first. Until then the
  // sync must fail loudly, never quietly merge a custom role into a built-in one.
  it('fails loudly when a custom role already has a new built-in role’s name', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      // Stand-in for a future built-in: remove one and give a custom role its name.
      await tx.delete(roles).where(and(eq(roles.organizationId, org.id), eq(roles.key, 'facility')))
      await createCustomRole(tx, org, { name: 'Facility', permissions: { facility: ['view'] } })
      await expect(tx.transaction((inner) => syncSystemRoles(inner, org.id))).rejects.toMatchObject(
        {
          cause: { code: '23505', constraint: 'roles_org_name_unique' },
        },
      )
    }))
})
