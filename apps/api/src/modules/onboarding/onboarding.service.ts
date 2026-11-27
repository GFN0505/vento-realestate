import type { createOrganizationInput, Entity, entityInput, Organization } from '@vento/shared'
import { and, count, eq } from 'drizzle-orm'
import type { z } from 'zod'
import { type AuthUser, type ServiceContext, setActiveOrganization } from '@/access/context'
import { syncSystemRoles } from '@/access/system-roles'
import type { DbOrTx } from '@/db/client'
import { entities, members, organizationPlans, organizations, users } from '@/db/schema'
import { conflict, forbidden } from '@/lib/errors'
import { recordAudit } from '@/modules/audit/audit.service'
import { insertEntity } from '@/modules/entities/entities.service'
import { lockOrganization, toOrganization } from '@/modules/organization/organization.service'
import { defaultPlanVersionId } from '@/platform/seed-plans'

/**
 * Step 1: the organization, its nine built-in roles and the person as owner, all or nothing.
 * The user row is locked so a double-click can't create two organizations.
 */
export async function createOrganization(
  db: DbOrTx,
  actor: { user: Pick<AuthUser, 'id' | 'name'>; sessionId: string | null },
  input: z.output<typeof createOrganizationInput>,
): Promise<Organization> {
  return db.transaction(async (tx) => {
    const [me] = await tx
      .select({ accountKind: users.accountKind })
      .from(users)
      .where(eq(users.id, actor.user.id))
      .for('update')
    // Staff accounts never belong to an organization (decision 0023); trigger members_refuse_staff
    // is the backstop.
    if (me?.accountKind === 'staff') {
      throw forbidden(
        'staff_account',
        "A Vento Real Estate staff account can't set up an organization. Use a customer account with a different email.",
      )
    }
    const [existing] = await tx
      .select({ name: organizations.name })
      .from(members)
      .innerJoin(organizations, eq(organizations.id, members.organizationId))
      .where(and(eq(members.userId, actor.user.id), eq(members.status, 'active')))
      .limit(1)
    if (existing) {
      throw conflict('already_onboarded', `You've already set up ${existing.name}.`)
    }
    const [org] = await tx.insert(organizations).values(input).returning()
    if (!org) throw new Error('Organization insert returned nothing')
    // A self-signed-up organization is standard on the default plan (owner's answer: Starter).
    const planVersionId = await defaultPlanVersionId(tx)
    await tx.insert(organizationPlans).values({
      organizationId: org.id,
      releaseGroup: 'standard',
      planVersionId,
      planAssignedAt: planVersionId ? new Date() : null,
    })
    const roleIds = await syncSystemRoles(tx, org.id)
    const ownerRoleId = roleIds.get('owner')
    if (!ownerRoleId) throw new Error('Owner role missing')
    await tx
      .insert(members)
      .values({ organizationId: org.id, userId: actor.user.id, roleId: ownerRoleId })
    await setActiveOrganization(tx, {
      userId: actor.user.id,
      sessionId: actor.sessionId,
      organizationId: org.id,
    })
    await recordAudit(tx, {
      organizationId: org.id,
      action: 'organization.created',
      actor: { userId: actor.user.id, name: actor.user.name },
      target: { type: 'organization', id: org.id, label: org.name },
      after: input,
    })
    return toOrganization(org)
  })
}

/** Step 2: refused once the organization has any entity, so it can't be replayed. */
export async function createFirstEntity(
  ctx: ServiceContext,
  input: z.output<typeof entityInput>,
): Promise<Entity> {
  return ctx.db.transaction(async (tx) => {
    await lockOrganization(tx, ctx.organizationId)
    const [row] = await tx
      .select({ n: count() })
      .from(entities)
      .where(eq(entities.organizationId, ctx.organizationId))
    if ((row?.n ?? 0) > 0) {
      throw conflict('already_onboarded', `${ctx.organizationName} already has its first company.`)
    }
    return insertEntity(tx, ctx, input)
  })
}
