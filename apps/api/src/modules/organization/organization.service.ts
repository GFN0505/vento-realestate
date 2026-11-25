import type { NigerianState, Organization, updateOrganizationInput } from '@vento/shared'
import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import { actorOf, type ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import { organizations } from '@/db/schema'
import { notFound } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'

type OrganizationRow = typeof organizations.$inferSelect

export function toOrganization(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    headOfficeState: row.headOfficeState as NigerianState,
    financialYearStartMonth: row.financialYearStartMonth,
    baseCurrency: 'NGN',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** Locks the organization row: serialises owner counts and last-entity checks. */
export async function lockOrganization(
  tx: DbOrTx,
  organizationId: string,
): Promise<OrganizationRow> {
  const [row] = await tx
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for('update')
  if (!row) throw notFound()
  return row
}

export async function getOrganization(ctx: ServiceContext): Promise<Organization> {
  const [row] = await ctx.db
    .select()
    .from(organizations)
    .where(eq(organizations.id, ctx.organizationId))
  if (!row) throw notFound()
  return toOrganization(row)
}

/** Only changed fields go into before/after, so the audit trail reads as a diff. */
export function diff<T extends Record<string, unknown>>(before: T, patch: Partial<T>) {
  const changed = Object.keys(patch).filter(
    (k) => patch[k as keyof T] !== undefined && patch[k as keyof T] !== before[k as keyof T],
  ) as (keyof T)[]
  return {
    changed,
    before: Object.fromEntries(changed.map((k) => [k, before[k]])),
    after: Object.fromEntries(changed.map((k) => [k, patch[k]])),
  }
}

export async function updateOrganization(
  ctx: ServiceContext,
  input: z.output<typeof updateOrganizationInput>,
): Promise<Organization> {
  return ctx.db.transaction(async (tx) => {
    const current = await lockOrganization(tx, ctx.organizationId)
    const change = diff(current, input)
    if (change.changed.length === 0) return toOrganization(current)
    const [row] = await tx
      .update(organizations)
      .set(input)
      .where(eq(organizations.id, ctx.organizationId))
      .returning()
    if (!row) throw notFound()
    await recordAudit(tx, {
      organizationId: ctx.organizationId,
      action: 'organization.updated',
      actor: actorOf(ctx),
      target: { type: 'organization', id: row.id, label: row.name },
      before: change.before,
      after: change.after,
    })
    return toOrganization(row)
  })
}
