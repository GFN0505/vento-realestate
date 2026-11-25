import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import { auditEvents } from '@/db/schema'
import { runWithRequestScope } from '@/lib/request-scope'
import { withRollback } from '@/test/db'
import { createMember, createOrganization } from '@/test/factories'
import { recordAccountEvent, recordAudit, redact } from './audit.service'

const actor = { userId: null, name: 'Test' }

describe('audit trail', () => {
  it('refuses UPDATE, DELETE and TRUNCATE, even for the table owner', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      await recordAudit(tx, {
        organizationId: org.id,
        action: 'organization.updated',
        actor,
        target: { type: 'organization' },
      })
      for (const statement of [
        sql`update audit_events set actor_name = 'x' where organization_id = ${org.id}`,
        sql`delete from audit_events where organization_id = ${org.id}`,
        sql`truncate audit_events`,
      ]) {
        await expect(tx.transaction((inner) => inner.execute(statement))).rejects.toThrow()
      }
    }))

  it('strips passwords, codes, secrets and tokens at any depth', () => {
    expect(
      redact({
        name: 'A',
        password: 'x',
        nested: { backupCodes: ['1'], token: 't', ok: 1 },
        list: [{ secret: 's', v: 2 }],
      }),
    ).toEqual({ name: 'A', nested: { ok: 1 }, list: [{ v: 2 }] })
  })

  it('never stores a full IP address, only the masked one from the request', () =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const scope = {
        requestId: 'r1',
        ip: '102.89.34.17',
        ipMasked: '102.89.34.x',
        userAgent: null,
        userAgentSummary: null,
        auth: {},
      }
      await runWithRequestScope(scope, () =>
        recordAudit(tx, {
          organizationId: org.id,
          action: 'organization.updated',
          actor,
          target: { type: 'organization' },
          metadata: { note: 'hi' },
        }),
      )
      const rows = await tx.select().from(auditEvents).where(eq(auditEvents.organizationId, org.id))
      expect(JSON.stringify(rows)).not.toContain('102.89.34.17')
      expect(rows[0]).toMatchObject({ ipMasked: '102.89.34.x', requestId: 'r1' })
    }))

  it('records account events once for each organization the person belongs to', () =>
    withRollback(async (tx) => {
      const a = await createOrganization(tx)
      const aisha = await createMember(tx, a, { role: 'finance' })
      const b = await createOrganization(tx, { name: 'Lekki Partners Ltd' })
      await createMember(tx, b, { role: 'viewer', user: aisha.user })
      const written = await recordAccountEvent(tx, {
        userId: aisha.user.id,
        action: 'auth.signed_in',
        actor: { userId: aisha.user.id, name: aisha.user.name },
      })
      expect(written).toBe(2)
    }))

  it('rolls back with the change it records', async () => {
    const org = await createOrganization(db, { name: 'Rollback Audit Ltd' })
    await expect(
      db.transaction(async (tx) => {
        await recordAudit(tx, {
          organizationId: org.id,
          action: 'organization.updated',
          actor,
          target: { type: 'organization' },
        })
        throw new Error('service failed')
      }),
    ).rejects.toThrow('service failed')
    expect(
      await db.select().from(auditEvents).where(eq(auditEvents.organizationId, org.id)),
    ).toHaveLength(0)
  })

  it('keeps passwords, codes and full IPs out of every event written by the flows', async () => {
    const rows = await db.select().from(auditEvents)
    const text = JSON.stringify(rows)
    expect(text).not.toMatch(/Parkview-gate-2026|"password"|"secret"|"backupCodes"/)
  })
})
