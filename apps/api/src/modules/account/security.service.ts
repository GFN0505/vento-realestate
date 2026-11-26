import { ORPCError } from '@orpc/server'
import type { PasskeyItem, SecurityOverview } from '@vento/shared'
import { PASSKEY_LIMIT } from '@vento/shared'
import { verifyPassword } from 'better-auth/crypto'
import { and, count, desc, eq, max } from 'drizzle-orm'
import { type AuthSession, type AuthUser, loadMembership } from '@/access/context'
import type { Auth } from '@/auth/auth'
import { webUrl } from '@/auth/hooks/deps'
import { lockedBody, onPasswordFailure } from '@/auth/hooks/sign-in-guard'
import { passkeysAvailableHere } from '@/auth/passkey-availability'
import { CONFIRM_PASSWORD_PER_MINUTE, REAUTH_WINDOW_MS } from '@/auth/policy'
import { activeLockUntil, clearAttempts } from '@/auth/security-store'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import { accounts, passkeys, passwordHistories, sessions, users } from '@/db/schema'
import type { EmailMessage, Mailer } from '@/email/mailer'
import { passkeyRemovedAlert } from '@/email/templates/security-alert'
import { badRequest, notFound } from '@/lib/errors'
import { formatDate, formatTime } from '@/lib/format'
import type { RateLimiter } from '@/lib/rate-limit'
import { recordAccountEvent } from '@/modules/audit/audit.service'
import type { FeatureStore } from '@/platform/feature-store'
import { twoStepRequiredBy } from './account.service'

// My security's personal procedures. Each acts only on the session's person: no input names a
// person, and another person's passkey id reads as not found. Not gated by two-step setup, so
// someone can always sign out a lost phone.

const self = (user: Pick<AuthUser, 'id' | 'name'>) => ({ userId: user.id, name: user.name })

/** null = "Set when you joined": only the sign-up (or invitation) password is on record. */
async function passwordChangedAt(db: DbOrTx, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ n: count(), newest: max(passwordHistories.createdAt) })
    .from(passwordHistories)
    .where(eq(passwordHistories.userId, userId))
  return row && row.n > 1 && row.newest ? row.newest.toISOString() : null
}

async function listPasskeys(db: DbOrTx, userId: string): Promise<PasskeyItem[]> {
  const rows = await db
    .select({
      id: passkeys.id,
      name: passkeys.name,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(desc(passkeys.createdAt), desc(passkeys.id))
  return rows.map((r) => ({
    id: r.id,
    name: r.name ?? 'Passkey',
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
  }))
}

function reauthenticatedUntil(session: Pick<AuthSession, 'reauthenticatedAt'>, now: Date) {
  const until = (session.reauthenticatedAt?.getTime() ?? 0) + REAUTH_WINDOW_MS
  return until > now.getTime() ? new Date(until).toISOString() : null
}

export async function getSecurity(
  db: DbOrTx,
  auth: Pick<Auth, 'api'>,
  user: AuthUser,
  session: AuthSession,
  store: FeatureStore,
): Promise<SecurityOverview> {
  const membership = await loadMembership(db, user.id, session.activeOrganizationId)
  const [changedAt, requiredBy, available] = await runQueries(db, [
    () => passwordChangedAt(db, user.id),
    () => twoStepRequiredBy(db, user, membership),
    () => passkeysAvailableHere(db, store, session),
  ])
  const items = available ? await listPasskeys(db, user.id) : []
  // Counted by Better Auth, which holds the codes encrypted.
  const backupCodesLeft = user.twoFactorEnabled
    ? (await auth.api.viewBackupCodes({ body: { userId: user.id } })).backupCodes.length
    : null
  return {
    name: user.name,
    email: user.email,
    passwordChangedAt: changedAt,
    twoStep: { enabled: user.twoFactorEnabled, requiredBy, backupCodesLeft },
    passkeys: { available, items, limit: PASSKEY_LIMIT },
    reauthenticatedUntil: reauthenticatedUntil(session, new Date()),
  }
}

function tooMany(retryAfterSeconds: number, message?: string) {
  return new ORPCError('TOO_MANY_REQUESTS', {
    message: message ?? 'Too many attempts. Wait a minute and try again.',
    data: { retryAfterSeconds: Math.max(1, retryAfterSeconds) },
  })
}

function lockRefusal(until: Date) {
  return tooMany(Math.ceil((until.getTime() - Date.now()) / 1000), lockedBody(until).message)
}

/**
 * "Confirm it's you": a right password opens a 5-minute window on this session. A wrong one
 * counts towards the sign-in lock (the 10th locks and emails) but leaves this session alone
 * (plan question 11). Not audited: it changes nothing; the action that follows is.
 */
export async function confirmPassword(
  deps: { db: DbOrTx; mailer: Mailer; rateLimiter: RateLimiter },
  user: AuthUser,
  session: Pick<AuthSession, 'id'>,
  password: string,
): Promise<{ reauthenticatedUntil: string }> {
  const { db } = deps
  const retry = deps.rateLimiter.hit(`confirm:${user.id}`, CONFIRM_PASSWORD_PER_MINUTE)
  if (retry > 0) throw tooMany(retry)
  const locked = await activeLockUntil(db, user.email)
  if (locked) throw lockRefusal(locked)
  const [account] = await db
    .select({ hash: accounts.password })
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')))
  // Better Auth's default hasher; we configure no other.
  const right = account?.hash ? await verifyPassword({ hash: account.hash, password }) : false
  if (!right) {
    const lockedUntil = await onPasswordFailure(deps, user.email)
    if (lockedUntil) throw lockRefusal(lockedUntil)
    throw badRequest('wrong_password', "That's not your password.")
  }
  await clearAttempts(db, 'password_failure', user.email)
  const now = new Date()
  await db
    .update(sessions)
    .set({ reauthenticatedAt: now })
    .where(and(eq(sessions.id, session.id), eq(sessions.userId, user.id)))
  return { reauthenticatedUntil: new Date(now.getTime() + REAUTH_WINDOW_MS).toISOString() }
}

/** Past audit rows keep the name used at the time (they store it). */
export async function updateName(
  db: DbOrTx,
  user: Pick<AuthUser, 'id'>,
  name: string,
): Promise<{ name: string; notice: string }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, user.id))
      .for('update')
    if (!current) throw notFound()
    if (current.name !== name) {
      await tx.update(users).set({ name }).where(eq(users.id, user.id))
      await recordAccountEvent(tx, {
        userId: user.id,
        action: 'account.name_changed',
        actor: { userId: user.id, name },
        before: { name: current.name },
        after: { name },
      })
    }
    return { name, notice: 'Name updated' }
  })
}

const PASSKEY_GONE = 'That passkey was already removed. The list is up to date.'

/** Rename needs passkeys available here (like the card); someone else's id is not found. */
export async function renamePasskey(
  db: DbOrTx,
  store: FeatureStore,
  user: Pick<AuthUser, 'id' | 'name'>,
  session: Pick<AuthSession, 'userId' | 'activeOrganizationId'>,
  input: { id: string; name: string },
): Promise<{ notice: string }> {
  if (!(await passkeysAvailableHere(db, store, session))) throw notFound()
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ name: passkeys.name })
      .from(passkeys)
      .where(and(eq(passkeys.id, input.id), eq(passkeys.userId, user.id)))
      .for('update')
    if (!current) throw notFound(PASSKEY_GONE)
    if (current.name !== input.name) {
      await tx
        .update(passkeys)
        .set({ name: input.name })
        .where(and(eq(passkeys.id, input.id), eq(passkeys.userId, user.id)))
      await recordAccountEvent(tx, {
        userId: user.id,
        action: 'passkey.renamed',
        actor: self(user),
        target: { type: 'passkey', id: input.id, label: input.name },
        before: { name: current.name },
        after: { name: input.name },
      })
    }
    return { notice: 'Passkey renamed' }
  })
}

/**
 * Works whatever the flag: a person can always remove their own passkey. Sessions already
 * signed in with it carry on. The alert goes after commit (the router sends `emails`).
 */
export async function removePasskey(
  db: DbOrTx,
  user: Pick<AuthUser, 'id' | 'name' | 'email'>,
  id: string,
): Promise<{ notice: string; emails: EmailMessage[] }> {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, user.id)))
      .returning({ id: passkeys.id, name: passkeys.name })
    if (!removed) throw notFound(PASSKEY_GONE)
    const name = removed.name ?? 'Passkey'
    await recordAccountEvent(tx, {
      userId: user.id,
      action: 'passkey.removed',
      actor: self(user),
      target: { type: 'passkey', id: removed.id, label: name },
    })
    const now = new Date()
    const alert = passkeyRemovedAlert({
      name,
      at: formatTime(now),
      on: formatDate(now),
      securityUrl: webUrl('/settings/security'),
      resetUrl: webUrl('/forgot-password'),
    })
    return {
      notice: 'Passkey removed',
      emails: [{ to: user.email, tag: 'security_alert', ...alert }],
    }
  })
}
