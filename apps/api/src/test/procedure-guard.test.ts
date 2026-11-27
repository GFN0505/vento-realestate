import type { ProcedureMeta } from '@vento/shared'
import { isFeatureKey } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { staticFeatureStore } from '@/platform/feature-store'
import { loadSnapshot } from '@/platform/snapshot'
import { PUBLIC_PROCEDURES, router } from '@/router'
import { testApp } from './auth-client'
import { countingDb } from './counting-db'
import { withRollback } from './db'
import {
  createCustomRole,
  createEntity,
  createMember,
  createOrganization,
  setStage,
  type TestUser,
} from './factories'
import { probeClient, probeRouter } from './feature-probe'
import { clientAs, testContext } from './router-client'
import { throwingDb } from './throwing-db'

/** Every procedure path in the router, e.g. "account.sessions.list". */
function procedurePaths(node: object, prefix: string[] = []): string[] {
  if ('~orpc' in node) return [prefix.join('.')]
  return Object.entries(node).flatMap(([key, child]) =>
    child && typeof child === 'object' ? procedurePaths(child, [...prefix, key]) : [],
  )
}

/**
 * Signed-in procedures that read no organization data, or change the organization on purpose,
 * so the tab guard (decision 0013) doesn't apply. Add to this list deliberately, never to make
 * a failing test pass: anything that touches organization data must be built on `member`.
 */
const PERSONAL_PROCEDURES = [
  'account.me',
  'account.switchOrganization',
  'account.sessions.list',
  'account.sessions.revoke',
  'account.sessions.revokeOthers',
  // My security (3d): about the signed-in person only; no input names a person or organization.
  'account.security',
  'account.confirmPassword',
  'account.updateName',
  'account.passkeys.rename',
  'account.passkeys.remove',
  'invitations.accept',
  'onboarding.createOrganization',
] as const

const isPublic = (path: string) => (PUBLIC_PROCEDURES as readonly string[]).includes(path)
const isPersonal = (path: string) => (PERSONAL_PROCEDURES as readonly string[]).includes(path)
/** The Vento console has no organization at all (decision 0021); its own walk covers it. */
const isConsole = (path: string) => path.startsWith('console.')

type Callable = (input: unknown) => Promise<unknown>

function procedureAt(client: object, path: string): Callable {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], client) as Callable
}

describe('procedure guard', () => {
  const paths = procedurePaths(router)
  const guarded = paths.filter((p) => !isPublic(p))

  it('finds every procedure', () => {
    expect(paths.length).toBeGreaterThan(25)
    expect(guarded).toContain('members.updateAccess')
    expect(guarded).toContain('access.whoCanChangeAccess')
  })

  it.each(guarded)('%s refuses an anonymous caller', async (path) => {
    const { app } = testApp()
    const res = await app.request(`/rpc/${path.replaceAll('.', '/')}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(res.status).toBe(401)
  })
})

describe('organization guard walk', () => {
  const paths = procedurePaths(router)
  const tabGuarded = paths.filter((p) => !isPublic(p) && !isPersonal(p) && !isConsole(p))

  it('lists only procedures that exist', () => {
    for (const path of PERSONAL_PROCEDURES) expect(paths).toContain(path)
  })

  // A database that throws on use proves the refusal happens before any read or write.
  it.each(tabGuarded)('%s refuses a tab showing another organization', async (path) => {
    const user = { id: '01936f1e-8b2a-7c3d-9e4f-000000000003', name: 'Tunde Ola' } as TestUser
    const { client } = clientAs(throwingDb(), user, {
      activeOrganizationId: '01936f1e-8b2a-7c3d-9e4f-000000000002',
      expectedOrganizationId: '01936f1e-8b2a-7c3d-9e4f-000000000001',
    })
    await expect(procedureAt(client, path)({})).rejects.toMatchObject({
      code: 'CONFLICT',
      data: { reason: 'organization_changed' },
    })
  })
})

describe('staff walk (decision 0023)', () => {
  const paths = procedurePaths(router)
  // Every customer procedure: built on `member` or `memberPendingTwoStep`.
  const customer = paths.filter((p) => !isPublic(p) && !isPersonal(p) && !isConsole(p))

  // A database that throws on use proves the refusal comes before any membership read or write.
  it.each(customer)(
    '%s answers a staff account NOT_FOUND before touching the database',
    async (path) => {
      const staff = {
        id: '01936f1e-8b2a-7c3d-9e4f-000000000004',
        name: 'Ada Okafor',
        email: 'ada@ventoerp.com',
        twoFactorEnabled: true,
        accountKind: 'staff',
      } as TestUser
      const { client } = clientAs(throwingDb(), staff)
      await expect(procedureAt(client, path)({})).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: "We couldn't find that. It may have been removed.",
      })
    },
  )
})

describe('all-companies guard (brick 3c)', () => {
  // Organization-wide changes: a member limited to some companies is refused before any write.
  const orgWide: [string, (ids: { role: string; entity: string }) => unknown][] = [
    ['organization.update', () => ({ name: 'Mine Ltd' })],
    ['organization.setTwoStepRequired', () => ({ required: true, seenChangedAt: null })],
    ['entities.create', () => ({ name: 'New SPV Ltd', type: 'spv' })],
    ['entities.archivePreview', (ids) => ({ id: ids.entity })],
    ['entities.archive', (ids) => ({ id: ids.entity })],
    ['entities.restore', (ids) => ({ id: ids.entity })],
    ['roles.create', (ids) => ({ name: 'Copy', sourceRoleId: ids.role })],
    ['roles.update', (ids) => ({ id: ids.role, version: 1, name: 'Renamed' })],
    ['roles.delete', (ids) => ({ id: ids.role })],
    ['checklist.answerSingleCompany', () => ({ singleCompany: true })],
  ]

  it.each(orgWide)('%s refuses a limited admin without writing', (path, input) =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const parkview = await createEntity(tx, org)
      const role = await createCustomRole(tx, org, { permissions: { projects: ['view'] } })
      const { user } = await createMember(tx, org, { role: 'admin', entityIds: [parkview.id] })
      const { db, calls } = countingDb(tx)
      const { client } = clientAs(db, user, { activeOrganizationId: org.id })
      await expect(
        procedureAt(client, path)(input({ role: role.id, entity: parkview.id })),
      ).rejects.toMatchObject({ code: 'FORBIDDEN', data: { reason: 'all_entities_required' } })
      expect(
        calls.filter((c) => ['insert', 'update', 'delete', 'transaction'].includes(c)),
      ).toEqual([])
    }),
  )
})

type ProcedureNode = { '~orpc': { meta: ProcedureMeta } }

function metaAt(root: object, path: string): ProcedureMeta {
  const node = path
    .split('.')
    .reduce<unknown>((n, key) => (n as Record<string, unknown>)[key], root) as ProcedureNode
  return node['~orpc'].meta
}

describe('feature declaration walk (decision 0016)', () => {
  const paths = procedurePaths(router)

  // A procedure with no declaration can't be gated: the contract must say `platform` or `forFeature`.
  it.each(paths)('%s declares its feature', (path) => {
    const meta = metaAt(router, path)
    expect(Object.hasOwn(meta, 'feature'), path).toBe(true)
    expect(meta.feature === null || isFeatureKey(meta.feature ?? '')).toBe(true)
  })

  // Decision 0021: console procedures are marked `area: 'console'` and only they are.
  it.each(paths)('%s is marked console exactly when it sits under console.', (path) => {
    const meta = metaAt(router, path)
    expect(meta.area === 'console', path).toBe(isConsole(path))
    if (isConsole(path)) expect(meta.feature, path).toBeNull()
  })

  it('never gates a public or personal procedure', () => {
    for (const path of paths.filter((p) => isPublic(p) || isPersonal(p))) {
      expect(metaAt(router, path).feature, path).toBeNull()
    }
  })

  it('carries the contract meta through implement() to the procedure', () => {
    expect(metaAt(probeRouter, 'sales.list').feature).toBe('sales')
    expect(metaAt(probeRouter, 'commissions.list').feature).toBe('sales.commissions')
  })
})

describe('feature gate walk', () => {
  const probePaths = procedurePaths(probeRouter)
  const routerGated = procedurePaths(router).filter((p) => metaAt(router, p).feature)

  // Today only the probe has a feature; every module procedure joins this list as it ships.
  it.each(routerGated)('%s answers NOT_FOUND where its feature is unavailable', (path) =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { releaseGroup: 'standard', planKey: 'enterprise' })
      const { client } = clientAs(tx, org.owner, { activeOrganizationId: org.id })
      await expect(procedureAt(client, path)({})).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }),
  )

  it.each(probePaths)(
    '%s: an owner where it is not released gets NOT_FOUND after only the membership query',
    (path) =>
      withRollback(async (tx) => {
        const org = await createOrganization(tx, {
          releaseGroup: 'standard',
          planKey: 'enterprise',
        })
        const store = staticFeatureStore(await loadSnapshot(tx))
        const { db, calls } = countingDb(tx)
        const client = probeClient(
          testContext(db, org.owner, { activeOrganizationId: org.id, features: store }),
        )
        await expect(procedureAt(client, path)({})).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: "We couldn't find that. It may have been removed.",
        })
        expect(calls).toEqual(['execute'])
      }),
  )

  it('checks availability before permission: a viewer without Sales gets FORBIDDEN only once Sales is available', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { releaseGroup: 'standard', planKey: 'enterprise' })
      const { user } = await createMember(tx, org, { role: 'hr' })
      const client = () => probeClient(testContext(tx, user, { activeOrganizationId: org.id }))
      await expect(client().sales.list()).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await setStage(tx, 'projects', 'on')
      await setStage(tx, 'sales', 'on')
      await expect(client().sales.list()).rejects.toMatchObject({
        code: 'FORBIDDEN',
        data: { reason: 'permission' },
      })
      await expect(
        probeClient(testContext(tx, org.owner, { activeOrganizationId: org.id })).sales.list(),
      ).resolves.toEqual({ ok: true })
    }))

  it('needs every prerequisite: Commissions stays NOT_FOUND while Sales is off', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { releaseGroup: 'internal' })
      await setStage(tx, 'sales', 'off')
      const client = probeClient(testContext(tx, org.owner, { activeOrganizationId: org.id }))
      await expect(client.commissions.list()).rejects.toMatchObject({ code: 'NOT_FOUND' })
    }))

  it('adds no query for an available feature compared with a platform procedure', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx, { releaseGroup: 'internal' })
      const store = staticFeatureStore(await loadSnapshot(tx))
      const probe = countingDb(tx)
      await probeClient(
        testContext(probe.db, org.owner, { activeOrganizationId: org.id, features: store }),
      ).sales.list()
      expect(probe.calls).toEqual(['execute'])
    }))
})
