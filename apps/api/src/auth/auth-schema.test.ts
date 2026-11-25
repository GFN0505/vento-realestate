import { getSchema } from 'better-auth/db'
import { getTableColumns } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { accounts, rateLimits, sessions, twoFactors, users, verifications } from '@/db/schema'
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
  rateLimit: rateLimits,
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
