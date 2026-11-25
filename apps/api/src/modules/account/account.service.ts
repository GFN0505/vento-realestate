import type { Me, NextStep, PaginationInput, SessionItem } from '@vento/shared'
import { and, count, desc, eq, gt, ne } from 'drizzle-orm'
import {
  type AuthSession,
  type AuthUser,
  resolveMembership,
  twoStepRequired,
} from '@/access/context'
import { userIdForResetToken } from '@/auth/security-store'
import type { DbOrTx } from '@/db/client'
import { entities, sessions, users } from '@/db/schema'
import { summariseUserAgent } from '@/lib/client-ip'
import { notFound } from '@/lib/errors'
import { pageOffset, toPage } from '@/lib/paginate'
import { recordAccountEvent } from '@/modules/audit/audit.service'

async function hasEntity(db: DbOrTx, organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(eq(entities.organizationId, organizationId))
    .limit(1)
  return Boolean(row)
}

/** The single source of truth for the web's guards: who, where, and what to do next. */
export async function getMe(db: DbOrTx, user: AuthUser, session: AuthSession): Promise<Me> {
  const membership = await resolveMembership(db, user, session)
  const required = twoStepRequired(user, membership?.member ?? null)
  let nextStep: NextStep = 'ready'
  if (!membership) nextStep = 'onboarding_organization'
  // Only an owner can finish setting the organization up; anyone invited before the first
  // entity exists goes straight on to two-step or the app.
  else if (
    membership.member.roleKey === 'owner' &&
    !(await hasEntity(db, membership.organizationId))
  ) {
    nextStep = 'onboarding_entity'
  } else if (required && !user.twoFactorEnabled) nextStep = 'two_step_setup'
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      twoFactorEnabled: user.twoFactorEnabled,
      companyName: user.companyName,
    },
    organization: membership
      ? { id: membership.organizationId, name: membership.organizationName }
      : null,
    member: membership
      ? {
          id: membership.member.id,
          role: {
            id: membership.member.roleId,
            key: membership.member.roleKey,
            name: membership.member.roleName,
          },
          entityIds: membership.member.entityIds,
          permissions: membership.member.permissions,
        }
      : null,
    nextStep,
    twoStepRequired: required,
  }
}

/** The email a reset link belongs to, for the reset screen. Expired or used: not found. */
export async function passwordResetInfo(db: DbOrTx, token: string): Promise<{ email: string }> {
  const userId = await userIdForResetToken(db, token)
  const [user] = userId
    ? await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
    : []
  if (!user) throw notFound()
  return user
}

export async function listSessions(
  db: DbOrTx,
  user: AuthUser,
  current: AuthSession,
  input: PaginationInput,
) {
  const where = and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))
  const { limit, offset } = pageOffset(input)
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: sessions.id,
        userAgent: sessions.userAgent,
        ipAddress: sessions.ipAddress,
        lastActiveAt: sessions.lastActiveAt,
        createdAt: sessions.createdAt,
        persistent: sessions.persistent,
      })
      .from(sessions)
      .where(where)
      .orderBy(desc(sessions.lastActiveAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(sessions).where(where),
  ])
  const items: SessionItem[] = rows.map((r) => ({
    id: r.id,
    ...summariseUserAgent(r.userAgent),
    ipMasked: r.ipAddress || null,
    lastActiveAt: r.lastActiveAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    persistent: r.persistent,
    isCurrent: r.id === current.id,
  }))
  return toPage(items, input, total?.n ?? 0)
}

const self = (user: AuthUser) => ({ userId: user.id, name: user.name })

/** Ends one of your own sessions. Someone else's session id is simply not found. */
export async function revokeSession(
  db: DbOrTx,
  user: AuthUser,
  id: string,
): Promise<{ notice: string }> {
  return db.transaction(async (tx) => {
    const ended = await tx
      .delete(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.userId, user.id)))
      .returning({ id: sessions.id, userAgent: sessions.userAgent })
    const [row] = ended
    if (!row) throw notFound()
    const { device, browser } = summariseUserAgent(row.userAgent)
    await recordAccountEvent(tx, {
      userId: user.id,
      action: 'session.revoked',
      actor: self(user),
      target: { type: 'session', id: row.id, label: `${browser} on ${device}` },
    })
    return { notice: `Signed out of ${browser} on ${device}` }
  })
}

export async function revokeOtherSessions(
  db: DbOrTx,
  user: AuthUser,
  current: AuthSession,
): Promise<{ count: number; notice: string }> {
  return db.transaction(async (tx) => {
    const ended = await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, current.id)))
      .returning({ id: sessions.id })
    const n = ended.length
    await recordAccountEvent(tx, {
      userId: user.id,
      action: 'session.revoked_others',
      actor: self(user),
      metadata: { count: n },
    })
    const notice =
      n === 0
        ? 'No other devices were signed in'
        : `Signed out of ${n} other ${n === 1 ? 'device' : 'devices'}`
    return { count: n, notice }
  })
}
