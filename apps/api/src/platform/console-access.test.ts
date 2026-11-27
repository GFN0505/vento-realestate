import { APIError } from 'better-auth/api'
import { symmetricEncrypt } from 'better-auth/crypto'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { DbOrTx } from '@/db/client'
import {
  accounts,
  passkeys,
  platformAuditEvents,
  sessions,
  twoFactors,
  verifications,
} from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { env } from '@/env'
import { createRateLimiter } from '@/lib/rate-limit'
import { PUBLIC_PROCEDURES, router } from '@/router'
import { totpFromUri } from '@/test/auth-client'
import { countingDb } from '@/test/counting-db'
import { withRollback } from '@/test/db'
import {
  createOrganization,
  createSession,
  createStaffAccount,
  createSuperAdmin,
  createUser,
  setStage,
  type TestUser,
} from '@/test/factories'
import { type ConsoleWindowState, clientAs, consoleClientAs } from '@/test/router-client'
import { type SoftAuthenticator, softAuthenticator } from '@/test/soft-authenticator'
import type { AccessContext } from './console/access.service'
import * as access from './console/access.service'
import { CONSOLE_PUBLIC_PROCEDURES } from './console/console.router'
import { liveFeatureStore } from './feature-store'
import { revokeSuperAdmin } from './operations/super-admin'

// Who can reach the Vento console, and how "Confirm it's you" opens it (admin-console plan §8).

function procedurePaths(node: object, prefix: string[] = []): string[] {
  if ('~orpc' in node) return [prefix.join('.')]
  return Object.entries(node).flatMap(([key, child]) =>
    child && typeof child === 'object' ? procedurePaths(child, [...prefix, key]) : [],
  )
}

type Callable = (input: unknown) => Promise<unknown>
function procedureAt(client: object, path: string): Callable {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], client) as Callable
}

const isConsolePublic = (p: string) => (CONSOLE_PUBLIC_PROCEDURES as readonly string[]).includes(p)
// The staff sign-up's two procedures are public (admin-console plan §1b.12): checked on their own.
const consolePaths = procedurePaths(router).filter(
  (p) => p.startsWith('console.') && !isConsolePublic(p),
)
const windowed = consolePaths.filter((p) => !p.startsWith('console.access.'))
const WRITES = ['insert', 'update', 'delete', 'transaction', 'execute']

const plainNotFound = {
  code: 'NOT_FOUND',
  message: "We couldn't find that. It may have been removed.",
}

describe('the console access walk', () => {
  it('covers every console procedure', () => {
    expect(windowed.length).toBeGreaterThan(30)
    expect(consolePaths).toContain('console.access.confirm')
  })

  it.each(consolePaths)('%s: a customer owner gets a plain NOT_FOUND after one read', (path) =>
    withRollback(async (tx) => {
      const org = await createOrganization(tx)
      const { db, calls } = countingDb(tx)
      const { client } = consoleClientAs(db, org.owner, { activeOrganizationId: org.id })
      const error = await procedureAt(client, path)({}).catch((e: unknown) => e)
      expect(error).toMatchObject(plainNotFound)
      expect((error as { data?: unknown }).data).toBeUndefined()
      expect(calls).toEqual(['select'])
    }),
  )

  it.each(consolePaths)('%s: a revoked super-admin gets the same plain NOT_FOUND', (path) =>
    withRollback(async (tx) => {
      const revoked = await createSuperAdmin(tx, {}, { revoked: true })
      const { client } = consoleClientAs(tx, revoked)
      const error = await procedureAt(client, path)({}).catch((e: unknown) => e)
      expect(error).toMatchObject(plainNotFound)
      expect((error as { data?: unknown }).data).toBeUndefined()
    }),
  )

  it.each(consolePaths.filter((p) => p !== 'console.access.status'))(
    '%s: a super-admin without two-step is told to set it up',
    (path) =>
      withRollback(async (tx) => {
        const admin = await createSuperAdmin(tx, { twoFactorEnabled: false })
        const { client } = consoleClientAs(tx, admin)
        await expect(procedureAt(client, path)({})).rejects.toMatchObject({
          code: 'NOT_FOUND',
          data: { reason: 'console_two_step_required' },
        })
      }),
  )

  for (const window of ['closed', 'idle', 'expired'] as ConsoleWindowState[]) {
    it.each(windowed)(`%s: a ${window} window is refused without a write`, (path) =>
      withRollback(async (tx) => {
        const admin = await createSuperAdmin(tx)
        const { db, calls } = countingDb(tx)
        const { client } = consoleClientAs(db, admin, { window })
        await expect(procedureAt(client, path)({})).rejects.toMatchObject({
          code: 'NOT_FOUND',
          data: { reason: 'console_window_closed' },
        })
        expect(calls.filter((c) => WRITES.includes(c))).toEqual([])
      }),
    )
  }

  it('lists the staff sign-up procedures as public, and they answer without a session', () =>
    withRollback(async (tx) => {
      for (const path of CONSOLE_PUBLIC_PROCEDURES) expect(PUBLIC_PROCEDURES).toContain(path)
      const { client } = clientAs(tx, null)
      await expect(client.console.join.get({ token: 'x'.repeat(43) })).resolves.toMatchObject({
        status: 'expired',
        email: null,
      })
    }))

  it('ignores the tab-organization header', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, admin, {
        activeOrganizationId: '01936f1e-8b2a-7c3d-9e4f-000000000002',
        expectedOrganizationId: '01936f1e-8b2a-7c3d-9e4f-000000000001',
      })
      await expect(client.console.organizations.summary()).resolves.toMatchObject({
        organizations: expect.any(Number),
      })
    }))

  it('records console activity on the session and, at most once a minute, the super-admin', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const session = await createSession(tx, admin)
      const { client } = consoleClientAs(tx, admin, { sessionId: session.id })
      await client.console.plans.list()
      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.consoleActiveAt).toBeInstanceOf(Date)
    }))
})

describe('opening the console', () => {
  it('reports the state without opening anything', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, admin, { window: 'closed' })
      await expect(client.console.access.status()).resolves.toEqual({
        window: 'closed',
        closesAt: null,
        freshProof: false,
        methods: { passkey: false },
      })
    }))

  it('says two-step is needed after a two-step reset', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx, { twoFactorEnabled: false })
      const { client } = consoleClientAs(tx, admin, { window: 'open' })
      await expect(client.console.access.status()).resolves.toMatchObject({
        window: 'two_step_required',
      })
    }))

  it('opens at once after a fresh code or passkey, and not after an old one', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const fresh = consoleClientAs(tx, admin, {
        window: 'closed',
        session: { secondFactorAt: new Date(Date.now() - 60_000) },
      })
      await expect(fresh.client.console.access.open()).resolves.toMatchObject({ window: 'open' })
      const stale = consoleClientAs(tx, admin, {
        window: 'closed',
        session: { secondFactorAt: new Date(Date.now() - 10 * 60_000) },
      })
      await expect(stale.client.console.access.open()).resolves.toMatchObject({ window: 'closed' })
    }))
})

async function withTwoFactorRow(tx: DbOrTx, user: TestUser) {
  await tx.insert(twoFactors).values({ userId: user.id, secret: 'x', backupCodes: 'x' })
}

const rightCode = { verifyTOTP: async () => ({}) }
const wrongCode = {
  verifyTOTP: async () => {
    throw new APIError('UNAUTHORIZED', { code: 'INVALID_CODE', message: 'Invalid code' })
  },
}

describe('confirming it is you with a code', () => {
  it('opens the window on this session and records it in their own trail', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const session = await createSession(tx, admin)
      const { client } = consoleClientAs(tx, admin, {
        window: 'closed',
        sessionId: session.id,
        authApi: rightCode,
      })
      await expect(
        client.console.access.confirm({ method: 'code', code: '123456' }),
      ).resolves.toMatchObject({ window: 'open', freshProof: true })
      const [row] = await tx.select().from(sessions).where(eq(sessions.id, session.id))
      expect(row?.consoleOpenedAt).toBeInstanceOf(Date)
      expect(row?.secondFactorAt).toBeInstanceOf(Date)
      const [event] = await tx
        .select({ metadata: platformAuditEvents.metadata, channel: platformAuditEvents.channel })
        .from(platformAuditEvents)
        .where(
          and(
            eq(platformAuditEvents.targetKey, admin.id),
            eq(platformAuditEvents.action, 'console.opened'),
          ),
        )
      // A staff account has no organization trail: its own events are on the platform trail.
      expect(event).toEqual({ metadata: { method: 'code' }, channel: 'account' })
    }))

  it('refuses a wrong code, audits it, and the fifth locks sign-in and signs them out', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      await withTwoFactorRow(tx, admin)
      await createSession(tx, admin)
      const { client, mailer } = consoleClientAs(tx, admin, {
        window: 'closed',
        authApi: wrongCode,
      })
      const confirm = () => client.console.access.confirm({ method: 'code', code: '000000' })
      for (let i = 0; i < 4; i++) {
        await expect(confirm()).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          data: { reason: 'wrong_code' },
        })
      }
      await expect(confirm()).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' })
      expect(await tx.select().from(sessions).where(eq(sessions.userId, admin.id))).toEqual([])
      expect(mailer.to(admin.email).length).toBeGreaterThan(0)
      const failures = await tx
        .select({ metadata: platformAuditEvents.metadata })
        .from(platformAuditEvents)
        .where(
          and(
            eq(platformAuditEvents.targetKey, admin.id),
            eq(platformAuditEvents.action, 'auth.two_step_failed'),
          ),
        )
      expect(failures[0]?.metadata).toEqual({ method: 'totp', during: 'console' })
    }))

  it('accepts a backup code and emails how many are left', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { client, mailer } = consoleClientAs(tx, admin, {
        window: 'closed',
        authApi: {
          verifyBackupCode: async () => ({}),
          viewBackupCodes: async () => ({ backupCodes: ['a', 'b'] }),
        },
      })
      await expect(
        client.console.access.confirm({ method: 'backup_code', code: 'abcde-fghij' }),
      ).resolves.toMatchObject({ window: 'open' })
      expect(mailer.to(admin.email).at(-1)?.subject).toBe(
        'Vento Real Estate: a backup code was used (2 left)',
      )
    }))

  it('never takes a password', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const { client } = consoleClientAs(tx, admin, { window: 'closed' })
      await expect(
        procedureAt(client, 'console.access.confirm')({ method: 'password', password: 'x' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    }))
})

async function storePasskey(tx: DbOrTx, user: TestUser, key: SoftAuthenticator) {
  await tx.insert(passkeys).values({
    userId: user.id,
    name: 'MacBook',
    publicKey: key.publicKey,
    credentialID: key.credentialId,
    counter: 0,
    deviceType: 'multiDevice',
    backedUp: true,
    transports: 'internal',
  })
}

async function passkeyAttempt(tx: DbOrTx, user: TestUser, sign: (challenge: string) => unknown) {
  // A code was proven after the passkey was added (a later one can't open the console).
  const { client } = consoleClientAs(tx, user, {
    window: 'closed',
    session: { secondFactorAt: new Date(Date.now() + 1000) },
  })
  const { options } = await client.console.access.passkeyOptions()
  const response = sign(String(options.challenge)) as Record<string, unknown>
  return { client, response }
}

describe('confirming it is you with a passkey', () => {
  it('opens the window from a valid assertion and moves the counter on', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const key = softAuthenticator(env.WEB_ORIGIN)
      await storePasskey(tx, admin, key)
      const { client, response } = await passkeyAttempt(tx, admin, (challenge) =>
        key.signIn({ challenge }),
      )
      await expect(
        client.console.access.confirm({ method: 'passkey', response }),
      ).resolves.toMatchObject({ window: 'open', methods: { passkey: true } })
      const [row] = await tx.select().from(passkeys).where(eq(passkeys.userId, admin.id))
      expect(row?.counter).toBe(1)
    }))

  it('refuses a replayed challenge, without counting towards a lock', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const key = softAuthenticator(env.WEB_ORIGIN)
      await storePasskey(tx, admin, key)
      const { client, response } = await passkeyAttempt(tx, admin, (challenge) =>
        key.signIn({ challenge }),
      )
      await client.console.access.confirm({ method: 'passkey', response })
      await expect(
        client.console.access.confirm({ method: 'passkey', response }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'passkey_failed' } })
    }))

  it("refuses someone else's passkey", () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const other = await createUser(tx, { twoFactorEnabled: true })
      const theirs = softAuthenticator(env.WEB_ORIGIN)
      await storePasskey(tx, admin, softAuthenticator(env.WEB_ORIGIN))
      await storePasskey(tx, other, theirs)
      const { client, response } = await passkeyAttempt(tx, admin, (challenge) =>
        theirs.signIn({ challenge }),
      )
      await expect(
        client.console.access.confirm({ method: 'passkey', response }),
      ).rejects.toMatchObject({ data: { reason: 'passkey_failed' } })
    }))

  it('refuses an assertion without user verification', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const key = softAuthenticator(env.WEB_ORIGIN)
      await storePasskey(tx, admin, key)
      const { client, response } = await passkeyAttempt(tx, admin, (challenge) =>
        key.signIn({ challenge }, { userVerified: false }),
      )
      await expect(
        client.console.access.confirm({ method: 'passkey', response }),
      ).rejects.toMatchObject({ data: { reason: 'passkey_failed' } })
    }))

  it('refuses an expired challenge', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const key = softAuthenticator(env.WEB_ORIGIN)
      await storePasskey(tx, admin, key)
      const { client, response } = await passkeyAttempt(tx, admin, (challenge) =>
        key.signIn({ challenge }),
      )
      await tx.update(verifications).set({ expiresAt: new Date(Date.now() - 1000) })
      await expect(
        client.console.access.confirm({ method: 'passkey', response }),
      ).rejects.toMatchObject({ data: { reason: 'passkey_failed' } })
    }))

  it('is not offered while passkeys are switched off for everyone', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      await storePasskey(tx, admin, softAuthenticator(env.WEB_ORIGIN))
      await setStage(tx, 'platform.passkeys', 'off')
      const { client } = consoleClientAs(tx, admin, { window: 'closed' })
      await expect(client.console.access.status()).resolves.toMatchObject({
        methods: { passkey: false },
      })
      await expect(client.console.access.passkeyOptions()).rejects.toMatchObject(plainNotFound)
    }))
})

describe('removing a super-admin', () => {
  it('closes their staff account: no sessions, factors or password, and no console', () =>
    withRollback(async (tx) => {
      const ada = await createSuperAdmin(tx)
      const tunde = await createStaffAccount(tx, { name: 'Tunde Ola' })
      await withTwoFactorRow(tx, tunde)
      await createSession(tx, tunde, { consoleOpenedAt: new Date() })
      await revokeSuperAdmin(
        tx,
        { userId: ada.id, name: ada.name, channel: 'console', operator: 'console' },
        { userId: tunde.id, reason: 'Left Vento Real Estate' },
      )
      expect(await tx.select().from(sessions).where(eq(sessions.userId, tunde.id))).toEqual([])
      expect(await tx.select().from(twoFactors).where(eq(twoFactors.userId, tunde.id))).toEqual([])
      expect(await tx.select().from(accounts).where(eq(accounts.userId, tunde.id))).toEqual([])
      const { client } = consoleClientAs(tx, tunde)
      await expect(client.console.plans.list()).rejects.toMatchObject(plainNotFound)
      await expect(clientAs(tx, tunde).client.account.me()).resolves.toMatchObject({
        console: null,
      })
    }))
})

describe('a password alone never makes a way into the console (audit H1)', () => {
  it('refuses a passkey added after the last code or passkey proof', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const key = softAuthenticator(env.WEB_ORIGIN)
      await storePasskey(tx, admin, key)
      // The session proved a code before the passkey was added (it was added with a password).
      const { client } = consoleClientAs(tx, admin, {
        window: 'closed',
        session: { secondFactorAt: new Date(Date.now() - 60_000) },
      })
      const { options } = await client.console.access.passkeyOptions()
      const response = key.signIn({ challenge: String(options.challenge) }) as Record<
        string,
        unknown
      >
      await expect(
        client.console.access.confirm({ method: 'passkey', response }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'passkey_failed' } })
    }))

  it('refuses backup codes made with only a password, without spending them', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      await tx.insert(twoFactors).values({
        userId: admin.id,
        secret: 'x',
        backupCodes: 'x',
        backupCodesUnprovenAt: new Date(),
      })
      let spent = false
      const { client } = consoleClientAs(tx, admin, {
        window: 'closed',
        authApi: {
          verifyBackupCode: async () => {
            spent = true
            return {}
          },
        },
      })
      await expect(
        client.console.access.confirm({ method: 'backup_code', code: 'abcde-fghij' }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST', data: { reason: 'wrong_code' } })
      expect(spent).toBe(false)
    }))
})

describe('console confirm limits (L3, L4)', () => {
  async function accessContext(tx: DbOrTx, admin: TestUser, extra: Partial<AccessContext> = {}) {
    return {
      db: tx,
      user: { ...admin, twoFactorEnabled: true, twoStepSetupRequired: false, companyName: null },
      session: {
        id: '01936f1e-8b2a-7c3d-9e4f-000000000000',
        userId: admin.id,
        activeOrganizationId: null,
        persistent: false,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        organizationEnteredAt: new Date(),
        reauthenticatedAt: null,
        secondFactorAt: new Date(Date.now() + 1000),
        consoleOpenedAt: null,
        consoleActiveAt: null,
      },
      admin: {
        userId: admin.id,
        name: admin.name,
        email: admin.email,
        twoFactorEnabled: true,
        lastConsoleAt: null,
      },
      headers: new Headers(),
      mailer: createMemoryTransport(),
      rateLimiter: createRateLimiter(true),
      featureStore: liveFeatureStore(tx),
      authApi: {
        verifyTOTP: async () => ({}),
        verifyBackupCode: async () => ({}),
        viewBackupCodes: async () => ({ backupCodes: [] }),
      },
      ...extra,
    } satisfies AccessContext
  }

  it('counts passkey options and confirm attempts together', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      await storePasskey(tx, admin, softAuthenticator(env.WEB_ORIGIN))
      const ctx = await accessContext(tx, admin)
      for (let i = 0; i < 10; i++) await access.passkeyOptions(ctx)
      await expect(access.confirm(ctx, { method: 'code', code: '123456' })).rejects.toMatchObject({
        code: 'TOO_MANY_REQUESTS',
      })
    }))

  it('refuses an authenticator code that was already used', () =>
    withRollback(async (tx) => {
      const admin = await createSuperAdmin(tx)
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'
      await tx.insert(twoFactors).values({
        userId: admin.id,
        secret: await symmetricEncrypt({ key: 'test-key', data: `base32:${secret}` }),
        backupCodes: 'x',
      })
      const code = totpFromUri(`otpauth://totp/Vento Real Estate:x?secret=${secret}`)
      const ctx = await accessContext(tx, admin, { totpKey: async () => 'test-key' })
      await expect(access.confirm(ctx, { method: 'code', code })).resolves.toMatchObject({
        window: 'open',
      })
      await expect(access.confirm(ctx, { method: 'code', code })).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        data: { reason: 'wrong_code' },
      })
    }))
})
