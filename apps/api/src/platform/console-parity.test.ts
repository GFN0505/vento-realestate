import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import { type DbOrTx, db as pool } from '@/db/client'
import { auditEvents, platformAuditEvents } from '@/db/schema'
import { createMemoryTransport } from '@/email/transports/memory'
import { router } from '@/router'
import { uniqueEmail, withRollback } from '@/test/db'
import {
  addAddOnRow,
  createOrganization,
  createSuperAdmin,
  setOverride,
  setStage,
  type TestOrg,
  type TestUser,
} from '@/test/factories'
import { consoleClientAs } from '@/test/router-client'
import { CHANGE_COMMANDS, type ChangeCommandId } from './cli/change-commands'
import { BREAK_GLASS_REFUSAL } from './cli/context'
import { memoryIo } from './cli/io'
import { runCommand } from './cli/run'
import { findPlanVersion } from './operations/common'
import { startTrial } from './operations/plans'
import { SETUP_ACTOR } from './seed-plans'

// Every change command and its console procedure make the same change (admin-console plan §7.2):
// run each on identical fresh data and compare the platform trail and the customer's notices.

type Fixture = {
  admin: TestUser
  /** Another active super-admin: told about every break-glass change. */
  other: TestUser
  org: TestOrg
  /** An email with no account yet, to invite. */
  newcomerEmail: string
  /** A super-admin to remove. */
  leaving: TestUser
}

type Case = {
  setup?: (tx: DbOrTx, f: Fixture) => Promise<void>
  /** The command without --break-glass, --by, --reason and --yes. */
  command: (f: Fixture) => string[]
  /** The console preview input; apply adds expected, reason and a key. */
  input: (f: Fixture) => Record<string, unknown>
  /** Bootstrap publishes and assigns several things; reset-two-step is command-only. */
  compare?: false
}

let planFile = ''
let growthDefinition: Record<string, unknown> = {}

beforeAll(async () => {
  const growth = await findPlanVersion(pool, 'growth')
  growthDefinition = {
    key: 'growth',
    name: 'Growth',
    sortOrder: growth.sortOrder,
    features: growth.features,
    limits: { projects: 8, entities: 6, members: 40, ai_budget: '0' },
  }
  planFile = join(mkdtempSync(join(tmpdir(), 'vento-parity-')), 'growth.json')
  writeFileSync(planFile, JSON.stringify(growthDefinition))
})

const org = (f: Fixture) => ({ organizationId: f.org.id })

const CASES: Record<ChangeCommandId, Case> = {
  'flags stage': {
    setup: (tx) => setStage(tx, 'documents', 'internal'),
    command: () => ['flags', 'stage', 'documents', 'pilot'],
    input: () => ({ key: 'documents', stage: 'pilot' }),
  },
  'flags group': {
    command: (f) => ['flags', 'group', f.org.id, 'pilot'],
    input: (f) => ({ ...org(f), group: 'pilot' }),
  },
  'flags override': {
    command: (f) => ['flags', 'override', f.org.id, 'buyer_portal', 'on'],
    input: (f) => ({ ...org(f), kind: 'release', key: 'buyer_portal', value: 'on' }),
  },
  'flags override clear': {
    setup: (tx, f) => setOverride(tx, f.org, { kind: 'release', key: 'buyer_portal' }),
    command: (f) => ['flags', 'override', f.org.id, 'buyer_portal', 'clear'],
    input: (f) => ({ ...org(f), kind: 'release', key: 'buyer_portal' }),
  },
  'plans publish': {
    command: () => ['plans', 'publish', 'growth', '--from', planFile],
    input: () => ({ ...growthDefinition, isNew: false }),
  },
  'plans assign': {
    command: (f) => ['plans', 'assign', f.org.id, 'growth'],
    input: (f) => ({ ...org(f), planKey: 'growth' }),
  },
  'plans trial': {
    command: (f) => ['plans', 'trial', f.org.id, 'enterprise', '--days', '30'],
    input: (f) => ({ ...org(f), planKey: 'enterprise', days: 30 }),
  },
  'plans trial --end': {
    setup: async (tx, f) => {
      const target = await findPlanVersion(tx, 'enterprise')
      await startTrial(tx, SETUP_ACTOR, {
        organization: { id: f.org.id, name: f.org.name },
        target,
        days: 30,
        reason: 'Parity setup',
      })
    },
    command: (f) => ['plans', 'trial', f.org.id, '--end'],
    input: (f) => org(f),
  },
  'plans addon': {
    command: (f) => ['plans', 'addon', f.org.id, 'ai', '--budget', '150000'],
    input: (f) => ({ ...org(f), budget: '150000' }),
  },
  'plans addon --remove': {
    setup: (tx, f) => addAddOnRow(tx, f.org),
    command: (f) => ['plans', 'addon', f.org.id, 'ai', '--remove'],
    input: (f) => org(f),
  },
  'plans override feature': {
    command: (f) => ['plans', 'override', f.org.id, 'feature', 'finance.tax', 'on'],
    input: (f) => ({ ...org(f), kind: 'feature', key: 'finance.tax', value: 'on' }),
  },
  'plans override limit': {
    command: (f) => ['plans', 'override', f.org.id, 'limit', 'entities', '8'],
    input: (f) => ({ ...org(f), kind: 'limit', key: 'entities', value: 8 }),
  },
  'plans override clear': {
    setup: (tx, f) =>
      setOverride(tx, f.org, { kind: 'limit', key: 'entities', limitValue: '8.00' }),
    command: (f) => ['plans', 'override', f.org.id, 'limit', 'entities', 'clear'],
    input: (f) => ({ ...org(f), kind: 'limit', key: 'entities' }),
  },
  'plans bootstrap': {
    command: () => ['plans', 'bootstrap'],
    input: () => ({}),
    compare: false,
  },
  'superadmin invite': {
    command: (f) => ['superadmin', 'invite', '--email', f.newcomerEmail, '--name', 'Tunde Bello'],
    input: (f) => ({ email: f.newcomerEmail, name: 'Tunde Bello' }),
  },
  'superadmin revoke': {
    command: (f) => ['superadmin', 'revoke', f.leaving.email],
    input: (f) => ({ userId: f.leaving.id }),
  },
  'superadmin reset-two-step': {
    command: (f) => ['superadmin', 'reset-two-step', f.leaving.email],
    input: (f) => ({ userId: f.leaving.id }),
    compare: false,
  },
}

const REASON = 'Parity check'
const IDS = Object.keys(CHANGE_COMMANDS) as ChangeCommandId[]

async function fixture(tx: DbOrTx, change: Case): Promise<Fixture> {
  const f: Fixture = {
    admin: await createSuperAdmin(tx),
    other: await createSuperAdmin(tx, { name: 'Bola Ade' }),
    org: await createOrganization(tx, { name: 'Parity Homes Ltd', planKey: 'starter' }),
    newcomerEmail: uniqueEmail('tunde'),
    leaving: await createSuperAdmin(tx, { name: 'Kemi Ojo' }),
  }
  await change.setup?.(tx, f)
  return f
}

async function runCli(tx: DbOrTx, f: Fixture, args: string[], breakGlass: boolean) {
  const [group = '', ...rest] = args
  const io = memoryIo([true])
  const mailer = createMemoryTransport()
  const flags = ['--by', f.admin.email, '--reason', REASON, '--yes']
  const code = await runCommand(
    group,
    [...rest, ...flags, ...(breakGlass ? ['--break-glass'] : [])],
    {
      db: tx,
      io,
      operator: 'ada@api-1',
      mailer,
      now: () => new Date(),
    },
  )
  return { code, io, mailer }
}

type Callable = (input: unknown) => Promise<unknown>
function procedureAt(root: object, path: string): Callable {
  return path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], root) as Callable
}

async function runConsole(tx: DbOrTx, f: Fixture, path: string, input: Record<string, unknown>) {
  const { client } = consoleClientAs(tx, f.admin)
  const preview = (await procedureAt(
    client.console,
    path.replace(/\.apply$/, '.preview'),
  )(input)) as { expected: unknown }
  await procedureAt(
    client.console,
    path,
  )({
    ...input,
    expected: preview.expected,
    reason: REASON,
    idempotencyKey: randomUUID(),
  })
}

/** Ids, emails and instants differ between two runs; everything else must match. */
function normalise(value: unknown): unknown {
  const text = JSON.stringify(value)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'ID')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?/g, 'TIME')
    .replace(/[\w.+-]+@test\.vento\.ng/g, 'EMAIL')
  return JSON.parse(text)
}

async function trailOf(tx: DbOrTx, f: Fixture) {
  const rows = await tx
    .select()
    .from(platformAuditEvents)
    .where(eq(platformAuditEvents.actorUserId, f.admin.id))
  const notices = await tx
    .select()
    .from(auditEvents)
    .where(
      and(eq(auditEvents.organizationId, f.org.id), eq(auditEvents.actorName, 'Vento Real Estate')),
    )
  return {
    channels: rows.map((r) => r.channel),
    platform: normalise(
      rows.map(({ action, targetType, targetKey, before, after, reason }) => ({
        action,
        targetType,
        targetKey,
        before,
        after,
        reason,
      })),
    ),
    // The setup's own notices (a trial started by the seed actor) are in both runs alike.
    notices: normalise(
      notices.map(({ action, before, after, metadata }) => ({ action, before, after, metadata })),
    ),
  }
}

/** The console change a command matches, or null for a command-only one. */
function consolePathOf(id: ChangeCommandId): string | null {
  return CHANGE_COMMANDS[id].console
}

describe('the parity registry', () => {
  it.each(IDS)('%s names a console change procedure (or its counterpart)', (id) => {
    const entry = CHANGE_COMMANDS[id]
    const path = entry.console ?? ('counterpart' in entry ? entry.counterpart : null)
    expect(path).not.toBeNull()
    const node = procedureAt(router.console, path ?? '') as unknown as {
      '~orpc': { meta: { area?: string } }
    }
    expect(node['~orpc'].meta.area).toBe('console')
  })

  it('has superadmin invite, the command-only reset-two-step, and no superadmin grant', () => {
    expect(CHANGE_COMMANDS['superadmin invite'].console).toBe('superAdmins.invite.apply')
    expect(CHANGE_COMMANDS['superadmin reset-two-step'].console).toBeNull()
    expect(Object.keys(CHANGE_COMMANDS)).not.toContain('superadmin grant')
  })
})

describe('break-glass', () => {
  it.each(IDS)('%s refuses without --break-glass and writes nothing', (id) =>
    withRollback(async (tx) => {
      const f = await fixture(tx, CASES[id])
      const { code, io } = await runCli(tx, f, CASES[id].command(f), false)
      expect(code).toBe(1)
      expect(io.errors).toEqual([BREAK_GLASS_REFUSAL])
      const rows = await tx
        .select()
        .from(platformAuditEvents)
        .where(eq(platformAuditEvents.actorUserId, f.admin.id))
      expect(rows).toEqual([])
    }),
  )

  it.each(IDS)('%s with --break-glass emails every other super-admin and the --by person', (id) =>
    withRollback(async (tx) => {
      const f = await fixture(tx, CASES[id])
      const { code, mailer } = await runCli(tx, f, CASES[id].command(f), true)
      expect(code).toBe(0)
      if (CASES[id].compare === false) return
      const [message] = mailer.to(f.other.email)
      expect(message?.subject).toMatch(/ from the command line$/)
      expect(message?.text).toContain('Ada Okafor')
      expect(message?.text).toContain(`on api-1 at`)
      expect(message?.text).toContain(`Reason: ${REASON}`)
      // The --by person is told too, in their own words (audit M2).
      const [own] = mailer.to(f.admin.email).filter((m) => m.tag === 'platform_notice')
      expect(own?.text).toContain('This was run as you on api-1')
    }),
  )

  it.each(IDS.filter((id) => CASES[id].compare !== false))(
    '%s writes the same trail as its console procedure',
    async (id) => {
      const change: Case = CASES[id]
      let command: Awaited<ReturnType<typeof trailOf>> | undefined
      let viaConsole: Awaited<ReturnType<typeof trailOf>> | undefined
      await withRollback(async (tx) => {
        const f = await fixture(tx, change)
        const { code, io } = await runCli(tx, f, change.command(f), true)
        expect(code, io.errors.join('\n')).toBe(0)
        command = await trailOf(tx, f)
      })
      await withRollback(async (tx) => {
        const f = await fixture(tx, change)
        await runConsole(tx, f, consolePathOf(id) ?? '', change.input(f))
        viaConsole = await trailOf(tx, f)
      })
      expect(command?.channels).toEqual(['command'])
      expect(viaConsole?.channels).toEqual(['console'])
      expect(viaConsole?.platform).toEqual(command?.platform)
      expect(viaConsole?.notices).toEqual(command?.notices)
    },
  )
})

describe('break-glass with no other super-admin', () => {
  it('tells the security inbox, and the --by person', () =>
    withRollback(async (tx) => {
      // Other tests commit super-admins; revoked here (rolled back) so this one is alone.
      const { platformAdmins } = await import('@/db/schema')
      await tx.update(platformAdmins).set({ revokedAt: new Date() })
      const admin = await createSuperAdmin(tx)
      const target = await createOrganization(tx, { planKey: 'starter' })
      const io = memoryIo([true])
      const mailer = createMemoryTransport()
      const code = await runCommand(
        'plans',
        [
          'assign',
          target.id,
          'growth',
          '--by',
          admin.email,
          '--reason',
          REASON,
          '--yes',
          '--break-glass',
        ],
        {
          db: tx,
          io,
          operator: 'ada@api-1',
          mailer,
          now: () => new Date(),
          securityAlertEmail: 'security@ventoerp.com',
        },
      )
      expect(code).toBe(0)
      expect(mailer.to('security@ventoerp.com')).toHaveLength(1)
      expect(mailer.to(admin.email)).toHaveLength(1)
    }))
})
