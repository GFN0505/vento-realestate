import { emptyPermissionSet } from '@vento/shared'
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { approvalDecisions, approvalRequests } from '@/db/schema'
import { updateRole } from '@/modules/roles/roles.service'
import { uniqueSuffix } from '@/test/db'
import {
  contextFor,
  createApprovalRule,
  createCustomRole,
  createMember,
  createOrganization,
} from '@/test/factories'
import { decide } from './engine'
import { approvalPlugins } from './registry'

// Real commits on separate pool connections: two approvers press Approve on the same step at
// the same moment. The request row lock serialises them; the second sees it already decided.

describe('approvals engine: two decisions at once', () => {
  it('lets one win and tells the other who did', async () => {
    const org = await createOrganization(db, { name: `Approvals race ${uniqueSuffix()}` })
    const bisi = await createMember(db, org, { role: 'owner', name: 'Bisi Lawal' })
    const ope = await createMember(db, org, { role: 'admin', name: 'Ope Martins' })
    const role = await createCustomRole(db, org, { permissions: { projects: ['view'] } })
    await createMember(db, org, { role: 'viewer', roleId: role.id })
    await createApprovalRule(db, org, { steps: [['owner']] })
    const asked = await updateRole(await contextFor(db, ope.user, org), {
      id: role.id,
      version: 1,
      permissions: { ...emptyPermissionSet(), projects: ['view', 'create'] },
      reason: 'Site engineers raise POs now',
    })
    if (asked.outcome.ran) throw new Error('expected a request')
    const requestId = asked.outcome.requestId
    const registry = approvalPlugins()
    const results = await Promise.allSettled([
      decide(await contextFor(db, org.owner, org), { requestId, decision: 'approve' }, registry),
      decide(await contextFor(db, bisi.user, org), { requestId, decision: 'approve' }, registry),
    ])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const lost = results.find((r) => r.status === 'rejected')
    expect(lost).toMatchObject({
      reason: expect.objectContaining({
        code: 'CONFLICT',
        data: expect.objectContaining({ reason: 'approval_decided' }),
      }),
    })
    expect(
      await db.select().from(approvalDecisions).where(eq(approvalDecisions.requestId, requestId)),
    ).toHaveLength(1)
    const [row] = await db.select().from(approvalRequests).where(eq(approvalRequests.id, requestId))
    expect(row?.status).toBe('approved')
  })
})
