import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { lagosIsoDate } from '@/lib/format'
import { logger } from '@/lib/logger'
import { withRollback } from '@/test/db'
import { contextFor, createMember, createOrganization } from '@/test/factories'
import { listAudit, listAuditPeople } from './audit-read.service'

// Plan §9: the audit log stays usable at a million entries. Slow to set up (about 30 s), so
// it runs only with PERF=1; TEST_LOG_LEVEL=info prints the times:
// `PERF=1 TEST_LOG_LEVEL=info pnpm --filter api exec vitest run audit-read.perf`.

const ROWS = 1_000_000
const DAY_MS = 86_400_000

describe.skipIf(process.env.PERF !== '1')('audit log at 1 million entries', () => {
  it(
    'reads page 1 of a full year, the Person filter included, in under a second',
    () =>
      withRollback(async (tx) => {
        const org = await createOrganization(tx)
        const kunle = await createMember(tx, org, { role: 'sales', name: 'Kunle Ojo' })
        // Only the setup needs longer than the pool's 30-second limit; it's back before timing.
        await tx.execute(sql`set local statement_timeout = 0`)
        // Spread over the last year, every tenth by Kunle, the rest by the owner.
        await tx.execute(sql`
        insert into audit_events
          (organization_id, actor_user_id, actor_name, action, target_type, target_label,
           before, after, created_at, updated_at)
        select ${org.id}::uuid,
          case when g % 10 = 0 then ${kunle.user.id}::uuid else ${org.owner.id}::uuid end,
          'Olumide Bankole', 'role.updated', 'role', 'Site engineer',
          '{"name":"Site engineer"}'::jsonb, '{"name":"Site lead"}'::jsonb,
          now() - (g * interval '31 seconds'), now() - (g * interval '31 seconds')
        from generate_series(1, ${ROWS}) g
      `)
        await tx.execute(sql`analyze audit_events`)
        await tx.execute(sql`set local statement_timeout = 30000`)
        const ctx = await contextFor(tx, org.owner, org)
        const range = {
          from: lagosIsoDate(new Date(Date.now() - 365 * DAY_MS)),
          to: lagosIsoDate(new Date()),
        }

        const started = performance.now()
        const page = await listAudit(ctx, { ...range, page: 1, pageSize: 25 })
        const listMs = performance.now() - started
        const peopleStarted = performance.now()
        const people = await listAuditPeople(ctx, { ...range, page: 1, pageSize: 25 })
        const peopleMs = performance.now() - peopleStarted

        logger.info('Audit log timing', {
          rows: page.total,
          listMs: Math.round(listMs),
          peopleMs: Math.round(peopleMs),
        })
        expect(page.items).toHaveLength(25)
        expect(people.total).toBe(2)
        expect(listMs).toBeLessThan(1_000)
        expect(peopleMs).toBeLessThan(1_000)
      }),
    300_000,
  )
})
