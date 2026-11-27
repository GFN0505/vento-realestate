import { MAX_CUSTOM_ROLES } from '@vento/shared'
import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { type DbOrTx, db } from '@/db/client'
import { roles } from '@/db/schema'
import { createInvitations, resendInvitation } from '@/modules/invitations/invitations.service'
import { updateMemberAccess } from '@/modules/members/members.service'
import { uniqueEmail, uniqueSuffix } from '@/test/db'
import {
  contextFor,
  createCustomRole,
  createInvitation,
  createMember,
  createOrganization,
  type TestOrg,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { deleteRole } from './roles.service'

// Real commits on separate pool connections: the only way to prove the locks serialise two
// requests. Each ordering is forced: the first runs inside a transaction held open until the
// second is seen waiting on a lock, so the second must wait and then re-check.

const fresh = (label: string) =>
  createOrganization(db, { name: `Race ${label} ${uniqueSuffix()}`.slice(0, 80) })
const client = (org: TestOrg, user = org.owner) =>
  clientAs(db, user, { activeOrganizationId: org.id }).client

/** Runs `work` in a transaction kept open until `release()`, so its locks stay held. */
async function holdOpen(work: (tx: DbOrTx) => Promise<unknown>) {
  let release = () => {}
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let held = () => {}
  const ready = new Promise<void>((resolve) => {
    held = resolve
  })
  const done = db.transaction(async (tx) => {
    await work(tx)
    held()
    await gate
  })
  await Promise.race([ready, done])
  return { release, done }
}

/** Resolves once some backend is waiting for a lock (polls pg_locks, up to 5 seconds). */
async function blockedOnALock(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    const result = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from pg_locks where not granted`,
    )
    if ((result.rows[0]?.n ?? 0) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error('the second request never waited on a lock')
}

/** First holds its locks; second starts, must wait, and is settled once first commits. */
async function inOrder(
  first: (tx: DbOrTx) => Promise<unknown>,
  second: () => Promise<unknown>,
): Promise<PromiseSettledResult<unknown>> {
  const holder = await holdOpen(first)
  const waiting = second()
  const outcome = waiting.then(
    (value) => ({ status: 'fulfilled', value }) as const,
    (reason: unknown) => ({ status: 'rejected', reason }) as const,
  )
  await blockedOnALock()
  holder.release()
  await holder.done
  return outcome
}

const refusedWith = (reason: string) => ({
  status: 'rejected',
  reason: expect.objectContaining({ data: expect.objectContaining({ reason }) }),
})

/** An organization with an unheld custom role, an admin to act, and Grace to give it to. */
async function world(label: string) {
  const org = await fresh(label)
  const site = await createCustomRole(db, org, { permissions: { projects: ['view'] } })
  const admin = await createMember(db, org, { role: 'admin', name: 'Aisha Bello' })
  const grace = await createMember(db, org, { role: 'viewer', name: 'Grace Umeh' })
  return { org, site, admin, grace }
}

describe('giving a role while it is deleted', () => {
  it('delete first: the change of role waits, then answers role_unavailable', async () => {
    const { org, site, admin, grace } = await world('Assign after delete')
    const result = await inOrder(
      async (tx) => deleteRole(await contextFor(tx, org.owner, org), site.id),
      () =>
        client(org, admin.user).members.updateAccess({
          memberId: grace.member.id,
          roleId: site.id,
          entityIds: null,
        }),
    )
    expect(result).toMatchObject(refusedWith('role_unavailable'))
  })

  it('change of role first: the delete waits, then answers role_in_use', async () => {
    const { org, site, admin, grace } = await world('Assign before delete')
    const result = await inOrder(
      async (tx) =>
        updateMemberAccess(await contextFor(tx, org.owner, org), {
          memberId: grace.member.id,
          roleId: site.id,
          entityIds: null,
        }),
      () => client(org, admin.user).roles.delete({ id: site.id }),
    )
    expect(result).toMatchObject(refusedWith('role_in_use'))
  })

  it('delete first: the invitation waits on the role row, then answers role_unavailable', async () => {
    const { org, site, admin } = await world('Invite after delete')
    const result = await inOrder(
      async (tx) => deleteRole(await contextFor(tx, org.owner, org), site.id),
      () =>
        client(org, admin.user).invitations.create({
          items: [{ email: uniqueEmail('racer'), roleId: site.id }],
          entityIds: null,
        }),
    )
    expect(result).toMatchObject(refusedWith('role_unavailable'))
  })

  it('invitation first: the delete waits on the role row, then answers role_in_use', async () => {
    const { org, site, admin } = await world('Invite before delete')
    const result = await inOrder(
      async (tx) =>
        createInvitations(await contextFor(tx, org.owner, org), {
          items: [{ email: uniqueEmail('racer'), roleId: site.id }],
          entityIds: null,
        }),
      () => client(org, admin.user).roles.delete({ id: site.id }),
    )
    expect(result).toMatchObject(refusedWith('role_in_use'))
  })
})

describe('resending an expired invitation while its role is deleted', () => {
  /** An invitation marked expired (superseded), so it doesn't hold the role but is history. */
  async function expiredInvitation(label: string) {
    const w = await world(label)
    const { invitation } = await createInvitation(db, w.org, {
      role: 'viewer',
      roleId: w.site.id,
      status: 'expired',
      expiresAt: new Date(Date.now() - 24 * 3600_000),
    })
    return { ...w, invitation }
  }

  it('delete first: the resend waits on the role row, then answers role_unavailable', async () => {
    const { org, admin, site, invitation } = await expiredInvitation('Resend after delete')
    const result = await inOrder(
      async (tx) => deleteRole(await contextFor(tx, org.owner, org), site.id),
      () => client(org, admin.user).invitations.resend({ id: invitation.id }),
    )
    expect(result).toMatchObject(refusedWith('role_unavailable'))
    const [role] = await db.select().from(roles).where(eq(roles.id, site.id))
    expect(role?.archivedAt).not.toBeNull()
  })

  it('resend first: the delete waits on the role row, then answers role_in_use', async () => {
    const { org, admin, site, invitation } = await expiredInvitation('Resend before delete')
    const result = await inOrder(
      async (tx) => resendInvitation(await contextFor(tx, org.owner, org), invitation.id),
      () => client(org, admin.user).roles.delete({ id: site.id }),
    )
    expect(result).toMatchObject(refusedWith('role_in_use'))
  })
})

const reasons = (results: PromiseSettledResult<unknown>[]) =>
  results.map((r) =>
    r.status === 'fulfilled'
      ? 'ok'
      : ((r.reason as { data?: { reason?: string } }).data?.reason ?? 'error'),
  )

describe('saving and creating roles at the same moment', () => {
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
