import { describe, expect, it } from 'vitest'
import { PUBLIC_PROCEDURES, router } from '@/router'
import { testApp } from './auth-client'

/** Every procedure path in the router, e.g. "account.sessions.list". */
function procedurePaths(node: object, prefix: string[] = []): string[] {
  if ('~orpc' in node) return [prefix.join('.')]
  return Object.entries(node).flatMap(([key, child]) =>
    child && typeof child === 'object' ? procedurePaths(child, [...prefix, key]) : [],
  )
}

describe('procedure guard', () => {
  const paths = procedurePaths(router)
  const guarded = paths.filter((p) => !(PUBLIC_PROCEDURES as readonly string[]).includes(p))

  it('finds every procedure', () => {
    expect(paths.length).toBeGreaterThan(25)
    expect(guarded).toContain('members.updateAccess')
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
