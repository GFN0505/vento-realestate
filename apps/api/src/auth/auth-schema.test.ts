import { getSchema } from 'better-auth/db'
import { getTableColumns, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import {
  accounts,
  knownDevices,
  passkeys,
  sessions,
  twoFactors,
  users,
  verifications,
} from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { createAuth } from './auth'

// We write Better Auth's tables by hand (decision 0010). This fails when an upgrade expects a
// column we don't have: diff `npx auth generate` against db/schema/auth.ts and add it.
const ours: Record<string, PgTable> = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  twoFactor: twoFactors,
  passkey: passkeys,
}

describe('Better Auth schema', () => {
  const expected = getSchema(createAuth({ db, mailer: createMemoryTransport() }).options)

  it('has a table for every model Better Auth uses', () => {
    expect(Object.keys(expected).sort()).toEqual(Object.keys(ours).sort())
  })

  it.each(Object.keys(ours))('%s has every field Better Auth expects', (model) => {
    const table = ours[model]
    const fields = Object.keys(expected[model]?.fields ?? {})
    const columns = table ? Object.keys(getTableColumns(table)) : []
    expect(fields.filter((f) => !columns.includes(f))).toEqual([])
  })
})

describe('identity tables', () => {
  // Passkeys and known devices belong to a person, not an organization (decision 0010).
  it.each([
    ['passkeys', passkeys],
    ['known_devices', knownDevices],
  ])('%s has no organization_id', (_name, table) => {
    expect(Object.keys(getTableColumns(table))).not.toContain('organizationId')
  })

  it('names the credential column credential_id, as Better Auth reads it', () => {
    expect(getTableColumns(passkeys).credentialID.name).toBe('credential_id')
  })
})

describe('rate limiting', () => {
  it('keeps per-IP counters in memory, so full IP addresses never reach the database', async () => {
    const auth = createAuth({ db, mailer: createMemoryTransport(), rateLimit: true })
    expect(auth.options.rateLimit?.storage).toBe('memory')
    const result = await db.execute<{ t: string | null }>(
      sql`select to_regclass('public.rate_limits') as t`,
    )
    expect(result.rows[0]?.t).toBeNull()
  })
})
