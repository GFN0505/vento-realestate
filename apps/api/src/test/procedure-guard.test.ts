import { describe, expect, it } from 'vitest'
import { PUBLIC_PROCEDURES, router } from '@/router'
import { testApp } from './auth-client'
import type { TestUser } from './factories'
import { clientAs } from './router-client'
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
  'invitations.accept',
  'onboarding.createOrganization',
] as const

const isPublic = (path: string) => (PUBLIC_PROCEDURES as readonly string[]).includes(path)
const isPersonal = (path: string) => (PERSONAL_PROCEDURES as readonly string[]).includes(path)

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
  const tabGuarded = paths.filter((p) => !isPublic(p) && !isPersonal(p))

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
