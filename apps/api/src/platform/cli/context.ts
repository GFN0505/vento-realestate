import { parseArgs } from 'node:util'
import {
  ADD_ON_KEYS,
  type AddOnKey,
  FEATURE_KEYS,
  type FeatureKey,
  isAddOnKey,
  isFeatureKey,
  isLimitKey,
  LIMIT_KEYS,
  type LimitKey,
  RELEASE_GROUPS,
  RELEASE_STAGES,
  type ReleaseGroup,
  type ReleaseStage,
} from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { platformAuditEvents } from '@/db/schema'
import type { Mailer } from '@/email/mailer'
import type { PlatformActor } from '../platform-audit'
import { PlatformError } from '../platform-error'
import { requireSuperAdmin } from '../super-admins'
import type { ChangeCommandId } from './change-commands'
import { closestKey } from './closest-key'
import type { Io } from './io'

export type CommandDeps = {
  db: DbOrTx
  io: Io
  /** `os-user@host`, recorded on every platform audit event. */
  operator: string | null
  mailer: Mailer
  now: () => Date
  /** Running from the scheduler (VENTO_CRON=1): `notify-trials` needs no `--by`. */
  scheduled?: boolean
  /**
   * Filled by `authorise` with each break-glass change this run made, so `runCommand` can email
   * the other super-admins once it has committed. Set by `runCommand`, not by the caller.
   */
  breakGlass?: BreakGlassChange[]
  /** Overrides SECURITY_ALERT_EMAIL (tests); null = none. */
  securityAlertEmail?: string | null
}

/** A change made with --break-glass: who, which command, and how to find its audit rows. */
export type BreakGlassChange = {
  command: ChangeCommandId
  actor: PlatformActor
  /** This person's command rows before the change: the rows after that are the change's. */
  rowsBefore: number
}

/** The console is the way to change things; the commands are kept for when it's down. */
export const BREAK_GLASS_REFUSAL =
  'Make this change in the Vento console. If the console is down, add --break-glass.'

export type Parsed = {
  positionals: string[]
  reason?: string
  by?: string
  yes: boolean
  until?: string
  days?: string
  budget?: string
  remove: boolean
  end: boolean
  version?: string
  from?: string
  name?: string
  sort?: string
  default: boolean
  bootstrap: boolean
  /** The console is down: allow a change from the command line (and tell the other super-admins). */
  breakGlass: boolean
}

export function parse(args: string[]): Parsed {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    strict: true,
    options: {
      reason: { type: 'string' },
      by: { type: 'string' },
      yes: { type: 'boolean', short: 'y', default: false },
      until: { type: 'string' },
      days: { type: 'string' },
      budget: { type: 'string' },
      remove: { type: 'boolean', default: false },
      end: { type: 'boolean', default: false },
      version: { type: 'string' },
      from: { type: 'string' },
      name: { type: 'string' },
      sort: { type: 'string' },
      default: { type: 'boolean', default: false },
      bootstrap: { type: 'boolean', default: false },
      'break-glass': { type: 'boolean', default: false },
    },
  })
  const { 'break-glass': breakGlass, ...rest } = values
  return { ...rest, breakGlass, positionals } as Parsed
}

function unknown(kind: string, value: string, keys: readonly string[]): never {
  const near = closestKey(value, keys)
  throw new PlatformError(
    `Unknown ${kind} "${value}".${near ? ` Did you mean ${near}?` : ` Known: ${keys.join(', ')}.`}`,
  )
}

export function featureArg(value: string | undefined): FeatureKey {
  if (!value) throw new PlatformError('Name a flag, e.g. sales or sales.commissions.')
  if (!isFeatureKey(value)) unknown('flag', value, FEATURE_KEYS)
  return value
}

export function stageArg(value: string | undefined): ReleaseStage {
  if (value && (RELEASE_STAGES as readonly string[]).includes(value)) return value as ReleaseStage
  return unknown('stage', value ?? '', RELEASE_STAGES)
}

export function groupArg(value: string | undefined): ReleaseGroup {
  if (value && (RELEASE_GROUPS as readonly string[]).includes(value)) return value as ReleaseGroup
  return unknown('release group', value ?? '', RELEASE_GROUPS)
}

export function limitArg(value: string | undefined): LimitKey {
  if (value && isLimitKey(value)) return value
  return unknown('limit', value ?? '', LIMIT_KEYS)
}

export function addOnArg(value: string | undefined): AddOnKey {
  if (value && isAddOnKey(value)) return value
  return unknown('add-on', value ?? '', ADD_ON_KEYS)
}

export function onOffClear(value: string | undefined): 'on' | 'off' | 'clear' {
  if (value === 'on' || value === 'off' || value === 'clear') return value
  throw new PlatformError('Say on, off or clear.')
}

/** `--reason` is required on every change (the console's own `reason` field does the same). */
export function requireReason(reason: string | undefined): string {
  const trimmed = reason?.trim() ?? ''
  if (trimmed.length < 3) throw new PlatformError('Add --reason so the audit trail says why.')
  return trimmed
}

/** How many platform audit rows this person has written from the command line. */
export async function commandRowCount(db: DbOrTx, actor: PlatformActor): Promise<number> {
  if (!actor.userId) return 0
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(platformAuditEvents)
    .where(
      and(
        eq(platformAuditEvents.actorUserId, actor.userId),
        eq(platformAuditEvents.channel, 'command'),
      ),
    )
  return row?.n ?? 0
}

/**
 * A change from the command line: refused without --break-glass, then `--by` must be an active
 * super-admin with two-step on and `--reason` is required.
 */
export async function authorise(
  deps: CommandDeps,
  parsed: Parsed,
  command: ChangeCommandId,
): Promise<{ actor: PlatformActor; reason: string }> {
  // First, before --by and --reason: changes belong in the console (decision 0021).
  if (!parsed.breakGlass) throw new PlatformError(BREAK_GLASS_REFUSAL)
  const actor = await requireSuperAdmin(deps.db, parsed.by, deps.operator)
  const reason = requireReason(parsed.reason)
  if (deps.breakGlass) {
    deps.breakGlass.push({ command, actor, rowsBefore: await commandRowCount(deps.db, actor) })
  }
  return { actor, reason }
}

/** Prints what will change and asks, unless --yes. */
export async function confirm(
  deps: CommandDeps,
  parsed: Parsed,
  lines: readonly (string | { text: string })[],
): Promise<boolean> {
  // The shared previews carry a tone for the console; the terminal prints the words.
  for (const line of lines) deps.io.print(typeof line === 'string' ? line : line.text)
  if (parsed.yes) return true
  const ok = await deps.io.confirm('Continue?')
  if (!ok) deps.io.print('Nothing changed.')
  return ok
}
