import { emptyPermissionSet } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { approvalRequests } from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { seedDefaultRules } from '@/modules/approval-rules/approval-rules.service'
import { withRollback } from '@/test/db'
import { createCustomRole, createMember, createOrganization } from '@/test/factories'
import { clientAs } from '@/test/router-client'
import { memoryIo } from './io'
import { runCommand } from './run'

// `pnpm approvals expire`: the daily tidy-up (plan §6.7), scheduled like plans notify-trials.

async function run(db: DbOrTx, args: string[], scheduled: boolean) {
  const io = memoryIo([])
  const code = await runCommand('approvals', args, {
    db,
    io,
    operator: 'cron@api-1',
    mailer: createMemoryTransport(),
    now: () => new Date(),
    scheduled,
  })
  return { code, io }
}

async function overdueRequest(tx: DbOrTx): Promise<string> {
  const org = await createOrganization(tx)
  await seedDefaultRules(tx, org.id, org.ownerMemberId)
  const ope = await createMember(tx, org, { role: 'admin', name: 'Ope Martins' })
  const role = await createCustomRole(tx, org, { permissions: { projects: ['view'] } })
  await createMember(tx, org, { role: 'viewer', roleId: role.id })
  const sent = await clientAs(tx, ope.user).client.roles.update({
    id: role.id,
    version: 1,
    permissions: { ...emptyPermissionSet(), projects: ['view', 'create'] },
    reason: 'x',
  })
  if (sent.outcome?.ran !== false) throw new Error('expected a request')
  await tx
    .update(approvalRequests)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(approvalRequests.id, sent.outcome.requestId))
  return sent.outcome.requestId
}

describe('approvals expire', () => {
  it('expires overdue requests from the scheduler', () =>
    withRollback(async (tx) => {
      const id = await overdueRequest(tx)
      const { code, io } = await run(tx, ['expire'], true)
      expect(code).toBe(0)
      expect(io.output.at(-1)).toMatch(/^Approval requests expired: [1-9]\d*\.$/)
      const [row] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, id))
      expect(row).toMatchObject({ status: 'expired', endedReason: 'timeout' })
    }))

  it('needs a super-admin by hand', () =>
    withRollback(async (tx) => {
      const id = await overdueRequest(tx)
      const { code } = await run(tx, ['expire'], false)
      expect(code).toBe(1)
      const [row] = await tx.select().from(approvalRequests).where(eq(approvalRequests.id, id))
      expect(row?.status).toBe('pending')
    }))
})
