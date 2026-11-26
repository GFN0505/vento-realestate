import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '@/db/client'
import {
  auditEvents,
  members,
  organizationPlans,
  passkeys,
  sessions,
  signInLocks,
  users,
} from '@/db/schema'
import { env } from '@/env'
import type { Snapshot } from '@/platform/availability'
import { staticFeatureStore } from '@/platform/feature-store'
import { loadSnapshot } from '@/platform/snapshot'
import { browser, testApp } from '@/test/auth-client'
import { uniqueEmail } from '@/test/db'
import { TEST_PASSWORD } from '@/test/factories'
import { onboard, signUpVerified } from '@/test/flows'
import { type SoftAuthenticator, softAuthenticator } from '@/test/soft-authenticator'

type App = ReturnType<typeof testApp>['app']
type Browser = ReturnType<typeof browser>

// These commit (Better Auth runs on the pool), so each test makes its own person and
// organization, and makes passkeys available to that organization only (never a global stage).

async function releaseTo(organizationId: string, group: 'internal' | 'standard') {
  await db
    .update(organizationPlans)
    .set({ releaseGroup: group })
    .where(eq(organizationPlans.organizationId, organizationId))
}

async function person(options: Parameters<typeof testApp>[0] = {}) {
  const { app, mailer } = testApp(options)
  const email = uniqueEmail('aisha')
  const b = browser(app)
  await signUpVerified(b, mailer, email)
  // A unique name: these commit, and the flags and plans command tests find organizations by name.
  await onboard(b, `Passkey Homes ${uniqueEmail('o')}`.slice(0, 60))
  const me = await b.rpc('account/me')
  const organizationId = String((me.body.organization as { id: string }).id)
  const userId = String((me.body.user as { id: string }).id)
  await releaseTo(organizationId, 'internal')
  return { app, mailer, email, b, organizationId, userId }
}

async function addPasskey(b: Browser, key = softAuthenticator(env.WEB_ORIGIN), name?: string) {
  await b.rpc('account/confirmPassword', { password: TEST_PASSWORD })
  const options = await b.authGet('/passkey/generate-register-options')
  const res = await b.auth('/passkey/verify-registration', {
    response: key.register(options.json as { challenge: string }),
    ...(name ? { name } : {}),
  })
  return { key, res }
}

async function passkeySignIn(app: App, key: SoftAuthenticator, headers?: Record<string, string>) {
  const b = browser(app)
  const options = await b.authGet('/passkey/generate-authenticate-options')
  const res = await b.auth(
    '/passkey/verify-authentication',
    { response: key.signIn(options.json as { challenge: string }) },
    headers,
  )
  return { b, res }
}

async function actions(userId: string) {
  const rows = await db
    .select({ action: auditEvents.action, metadata: auditEvents.metadata })
    .from(auditEvents)
    .where(eq(auditEvents.actorUserId, userId))
  return rows
}

async function sessionCount(userId: string) {
  return (await db.select().from(sessions).where(eq(sessions.userId, userId))).length
}

describe('adding a passkey', () => {
  it('needs "Confirm it\'s you" first', async () => {
    const { b } = await person()
    const res = await b.authGet('/passkey/generate-register-options')
    expect(res.status).toBe(403)
    expect(res.json.code).toBe('REAUTH_REQUIRED')
  })

  it('is refused when passkeys aren’t available to the organization', async () => {
    const { b, organizationId } = await person()
    await releaseTo(organizationId, 'standard')
    await b.rpc('account/confirmPassword', { password: TEST_PASSWORD })
    const res = await b.authGet('/passkey/generate-register-options')
    expect(res.status).toBe(404)
    expect(res.json.code).toBe('PASSKEYS_UNAVAILABLE')
  })

  it('stores it with a default name, ignores a client name, audits and emails', async () => {
    const { b, mailer, email, userId } = await person()
    const { res } = await addPasskey(b, undefined, 'Hacker named me')
    expect(res.status).toBe(200)
    const [row] = await db.select().from(passkeys).where(eq(passkeys.userId, userId))
    expect(row?.name).toBe('iCloud Keychain · Mac')
    expect((await actions(userId)).map((a) => a.action)).toContain('passkey.added')
    expect(mailer.to(email).at(-1)?.subject).toBe('Vento: a passkey was added to your account')
  })

  it('refuses a passkey that skipped Face ID, fingerprint or PIN', async () => {
    const { b, userId } = await person()
    await b.rpc('account/confirmPassword', { password: TEST_PASSWORD })
    const options = await b.authGet('/passkey/generate-register-options')
    const key = softAuthenticator(env.WEB_ORIGIN)
    const res = await b.auth('/passkey/verify-registration', {
      response: key.register(options.json as { challenge: string }, { userVerified: false }),
    })
    expect(res.status).toBe(400)
    expect(await db.select().from(passkeys).where(eq(passkeys.userId, userId))).toEqual([])
  })

  it('stops at 10', async () => {
    const { b, userId } = await person()
    await db.insert(passkeys).values(
      Array.from({ length: 10 }, (_, i) => ({
        userId,
        name: `Key ${i}`,
        publicKey: 'x',
        credentialID: `cred-${userId}-${i}`,
        counter: 0,
        deviceType: 'singleDevice',
        backedUp: false,
      })),
    )
    await b.rpc('account/confirmPassword', { password: TEST_PASSWORD })
    const res = await b.authGet('/passkey/generate-register-options')
    expect(res.status).toBe(409)
    expect(res.json.code).toBe('PASSKEY_LIMIT')
  })

  // Pins `freshAge: 0`: our 5-minute confirmation replaces Better Auth's one-day freshness.
  it('works on a 3-day-old "Keep me signed in" session after confirming', async () => {
    const { b, userId } = await person()
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600_000)
    await db
      .update(sessions)
      .set({ createdAt: threeDaysAgo, persistent: true, lastActiveAt: new Date() })
      .where(eq(sessions.userId, userId))
    const { res } = await addPasskey(b)
    expect(res.status).toBe(200)
  })
})

describe('signing in with a passkey', () => {
  it('signs in with no two-step code, audits the method and records the use', async () => {
    const { app, b, userId } = await person()
    const { key } = await addPasskey(b)
    // Two-step on: a password sign-in would ask for a code; a passkey never does (decision 0019).
    await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId))
    const { b: other, res } = await passkeySignIn(app, key)
    expect(res.status).toBe(200)
    expect(res.json).not.toHaveProperty('twoFactorRedirect')
    expect((await other.rpc('account/me')).status).toBe(200)
    const signedIn = (await actions(userId)).filter((a) => a.action === 'auth.signed_in')
    expect(signedIn.at(-1)?.metadata).toEqual({ method: 'passkey' })
    const [row] = await db.select().from(passkeys).where(eq(passkeys.userId, userId))
    expect(row?.lastUsedAt).not.toBeNull()
  })

  it('keeps the session 30 days with x-vento-remember: 1, else 12 hours', async () => {
    const { app, b, userId } = await person()
    const { key } = await addPasskey(b)
    await db.delete(sessions).where(eq(sessions.userId, userId))
    await passkeySignIn(app, key, { 'x-vento-remember': '1' })
    await passkeySignIn(app, key)
    const rows = await db.select().from(sessions).where(eq(sessions.userId, userId))
    const hours = rows
      .map((r) => Math.round((r.expiresAt.getTime() - r.createdAt.getTime()) / 3_600_000))
      .sort((x, y) => x - y)
    expect(hours).toEqual([12, 30 * 24])
    expect(rows.find((r) => r.persistent)).toBeDefined()
  })

  it('works while sign-in is locked: a passkey can’t be guessed', async () => {
    const { app, b, email, userId } = await person()
    const { key } = await addPasskey(b)
    await db.insert(signInLocks).values({
      email,
      userId,
      reason: 'password',
      lockedUntil: new Date(Date.now() + 15 * 60_000),
    })
    expect((await passkeySignIn(app, key)).res.status).toBe(200)
  })

  it('is refused after a two-step reset, and the session it made is deleted', async () => {
    const { app, b, userId } = await person()
    const { key } = await addPasskey(b)
    await db.update(users).set({ passwordResetRequired: true }).where(eq(users.id, userId))
    await db.delete(sessions).where(eq(sessions.userId, userId))
    const { res } = await passkeySignIn(app, key)
    expect(res.status).toBe(403)
    expect(res.json.code).toBe('PASSWORD_RESET_REQUIRED')
    expect(await sessionCount(userId)).toBe(0)
  })

  it('is refused when passkeys are available in none of their organizations', async () => {
    const { app, b, organizationId, userId } = await person()
    const { key } = await addPasskey(b)
    await releaseTo(organizationId, 'standard')
    await db.delete(sessions).where(eq(sessions.userId, userId))
    const { res } = await passkeySignIn(app, key)
    expect(res.status).toBe(403)
    expect(res.json.code).toBe('PASSKEYS_UNAVAILABLE')
    expect(await sessionCount(userId)).toBe(0)
  })

  it('says only "not recognised" for someone removed from every organization', async () => {
    const { app, b, userId } = await person()
    const { key } = await addPasskey(b)
    // An organization always keeps an owner: hand it to someone else, then remove this person.
    const [membership] = await db.select().from(members).where(eq(members.userId, userId))
    const [heir] = await db
      .insert(users)
      .values({ name: 'Bisi Lawal', email: uniqueEmail('bisi'), emailVerified: true })
      .returning()
    await db.insert(members).values({
      organizationId: membership?.organizationId ?? '',
      userId: heir?.id ?? '',
      roleId: membership?.roleId ?? '',
    })
    await db
      .update(members)
      .set({ status: 'removed', removedAt: new Date() })
      .where(eq(members.userId, userId))
    await db.delete(sessions).where(eq(sessions.userId, userId))
    const { res } = await passkeySignIn(app, key)
    expect(res.status).toBe(401)
    expect(res.json.code).toBe('PASSKEY_NOT_RECOGNISED')
    expect(await sessionCount(userId)).toBe(0)
  })

  it('refuses an unknown passkey without counting towards a lock', async () => {
    const { app, email } = await person()
    const { res } = await passkeySignIn(app, softAuthenticator(env.WEB_ORIGIN))
    expect(res.status).toBe(401)
    expect(res.json.code).toBe('PASSKEY_NOT_FOUND')
    expect(await db.select().from(signInLocks).where(eq(signInLocks.email, email))).toEqual([])
  })

  it('refuses a sign-in without user verification', async () => {
    const { app, b } = await person()
    const { key } = await addPasskey(b)
    const other = browser(app)
    const options = await other.authGet('/passkey/generate-authenticate-options')
    const res = await other.auth('/passkey/verify-authentication', {
      response: key.signIn(options.json as { challenge: string }, { userVerified: false }),
    })
    expect(res.status).toBe(400)
    expect(res.json.code).toBe('AUTHENTICATION_FAILED')
  })

  it('uses each challenge once', async () => {
    const { app, b } = await person()
    const { key } = await addPasskey(b)
    const other = browser(app)
    const options = (await other.authGet('/passkey/generate-authenticate-options')).json as {
      challenge: string
    }
    expect(
      (await other.auth('/passkey/verify-authentication', { response: key.signIn(options) }))
        .status,
    ).toBe(200)
    const again = await other.auth('/passkey/verify-authentication', {
      response: key.signIn(options),
    })
    expect(again.json.code).toBe('CHALLENGE_NOT_FOUND')
  })

  it('emails a new sign-in from a browser never seen, and not again from the same one', async () => {
    const { app, b, mailer, email } = await person()
    const { key } = await addPasskey(b)
    const { b: phone } = await passkeySignIn(app, key)
    const alerts = () => mailer.to(email).filter((m) => m.subject.startsWith('Vento: new sign-in'))
    expect(alerts()).toHaveLength(1)
    expect(alerts()[0]?.text).not.toMatch(/\d+\.\d+\.\d+/)
    const options = await phone.authGet('/passkey/generate-authenticate-options')
    await phone.auth('/passkey/verify-authentication', {
      response: key.signIn(options.json as { challenge: string }),
    })
    expect(alerts()).toHaveLength(1)
  })
})

describe('the passkeys kill switch', () => {
  it('refuses sign-in options at stage off and leaves passkeys alone', async () => {
    const { b, userId } = await person()
    await addPasskey(b)
    const snapshot: Snapshot = await loadSnapshot(db)
    const off = staticFeatureStore({
      ...snapshot,
      stages: new Map([...snapshot.stages, ['platform.passkeys', 'off']]),
    })
    const { app } = testApp({ features: off })
    const res = await browser(app).authGet('/passkey/generate-authenticate-options')
    expect(res.status).toBe(404)
    expect(res.json.code).toBe('PASSKEYS_UNAVAILABLE')
    expect(await db.select().from(passkeys).where(eq(passkeys.userId, userId))).toHaveLength(1)
  })
})

describe('Better Auth endpoints switched off', () => {
  it.each([
    ['/passkey/list-user-passkeys', 'GET'],
    ['/passkey/update-passkey', 'POST'],
    ['/passkey/delete-passkey', 'POST'],
  ])('%s answers 404: our audited procedures replace it', async (path, method) => {
    const { b } = await person()
    const res =
      method === 'GET' ? await b.authGet(path) : await b.auth(path, { id: 'x', name: 'y' })
    expect(res.status).toBe(404)
  })

  it.each([
    { name: 'Someone Else' },
    { image: 'https://x.test/a.png' },
    { companyName: 'Other Ltd' },
  ])('/update-user answers 404 for %o', async (body) => {
    const { b, userId } = await person()
    expect((await b.auth('/update-user', body)).status).toBe(404)
    const [row] = await db
      .select({ name: users.name, image: users.image })
      .from(users)
      .where(and(eq(users.id, userId)))
    expect(row).toEqual({ name: 'Olumide Bankole', image: null })
  })
})
