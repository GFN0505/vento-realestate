import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '@/app'
import { db, pool } from '@/db/client'

afterAll(async () => {
  await pool.end()
})

describe('health check', () => {
  it('reports ok when the database is reachable', async () => {
    const res = await createApp({ db }).request('/health')

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok', database: 'up' })
  })

  it('answers through the typed RPC endpoint', async () => {
    const res = await createApp({ db }).request('/rpc/health/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ json: { status: 'ok', database: 'up' } })
  })

  it('reports degraded with 503 when the database is down', async () => {
    const deadPool = new Pool({ connectionString: 'postgres://nobody@127.0.0.1:1/none' })
    const deadDb = drizzle({ client: deadPool, casing: 'snake_case' })

    const res = await createApp({ db: deadDb }).request('/health')

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ status: 'degraded', database: 'down' })
    await deadPool.end()
  })

  it('sets security headers on every response', async () => {
    const res = await createApp({ db }).request('/health')

    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
})
