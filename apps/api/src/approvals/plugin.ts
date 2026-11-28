import type {
  ApprovalActionKey,
  ApprovalSubject,
  ApprovalSummary,
  PermissionAction,
  PermissionModule,
} from '@vento/shared'
import type { z } from 'zod'
import type { ServiceContext } from '@/access/context'
import type { DbOrTx } from '@/db/client'
import type { ApprovalExclusion } from '@/db/schema'
import type { EmailMessage, Mailer } from '@/email/mailer'

// The plug-in contract (decision 0024). A module registers each approvable action once; its
// service calls requestOrRun where it would act, and the engine does the rest.

/** One approver of a request, in step order, for the action's own audit event. */
export type Approver = { name: string; position: number }

/** How the action came to run: at once, after approvals, or with nobody else to approve. */
export type ExecuteMeta = {
  approvedBy: Approver[]
  approvalRequestId: string | null
  /** Went ahead because nobody else could approve (the catalog said `proceed`). */
  noApprover: boolean
}

export const RAN_AT_ONCE: ExecuteMeta = {
  approvedBy: [],
  approvalRequestId: null,
  noApprover: false,
}

/** What runs after the transaction commits (sending mail never undoes a change). */
export type AfterCommitDeps = {
  db: DbOrTx
  mailer: Mailer
  organizationId: string
  requestId?: string
}

export type ExecuteResult = {
  notice: string
  emails: EmailMessage[]
  /** Anything else after commit, e.g. recording an invitation's delivery. */
  afterCommit: ((deps: AfterCommitDeps) => Promise<void>) | null
}

export type Described = {
  summary: ApprovalSummary
  /** The request's company; null for organization-wide actions. */
  entityId: string | null
}

/** The permission the action needs, checked on the maker again when the last approval lands. */
export type PluginPermission = { module: PermissionModule; action: PermissionAction }

/**
 * Preview only (security M4): whether a rule would apply to this record at all, and the record's
 * company, worked out from the record itself (never from the caller's input). An id outside the
 * viewer's scope throws NOT_FOUND.
 */
export type Applies = { applies: boolean; entityId: string | null }

export type ApprovalPlugin<P, R extends ExecuteResult = ExecuteResult> = {
  key: ApprovalActionKey
  permission: PluginPermission
  /**
   * Any other permission the maker needs (clearing an encumbrance also uploads its evidence, so
   * Land & title create). Checked by preview and, with `permission`, when the last approval lands.
   */
  alsoRequires?: readonly PluginPermission[]
  /** What's stored on the request. Never secrets. Re-validated before it runs. */
  payload: z.ZodType<P>
  /** The record: one pending request per record and action. */
  subject(p: P): ApprovalSubject
  /** Computed once at request time: the change, its company and amount. */
  describe(tx: DbOrTx, ctx: ServiceContext, p: P): Promise<Described>
  /** Who mustn't approve, and the reason they see. Asked again when someone decides. */
  excluded(tx: DbOrTx, ctx: ServiceContext, p: P): Promise<ApprovalExclusion[]>
  /**
   * Re-checks the record as the maker (throw StaleError, or the module's own refusal, when it
   * changed) and does the action, writing its own audit event with approvalMetadata(meta).
   */
  execute(tx: DbOrTx, ctx: ServiceContext, p: P, meta: ExecuteMeta): Promise<R>
  /** Preview only (default: applies, organization-wide). */
  appliesTo?(tx: DbOrTx, ctx: ServiceContext, subject: ApprovalSubject): Promise<Applies>
}

/** The same plug-in with its payload type erased behind parsing, for the registry. */
export type RegisteredPlugin = {
  key: ApprovalActionKey
  permission: PluginPermission
  /** `permission` first, then `alsoRequires`. */
  permissions: readonly PluginPermission[]
  subject(raw: unknown): ApprovalSubject
  describe(tx: DbOrTx, ctx: ServiceContext, raw: unknown): Promise<Described>
  excluded(tx: DbOrTx, ctx: ServiceContext, raw: unknown): Promise<ApprovalExclusion[]>
  execute(tx: DbOrTx, ctx: ServiceContext, raw: unknown, meta: ExecuteMeta): Promise<ExecuteResult>
  appliesTo(tx: DbOrTx, ctx: ServiceContext, subject: ApprovalSubject): Promise<Applies>
}

const ORGANIZATION_WIDE: Applies = { applies: true, entityId: null }

export function registerPlugin<P, R extends ExecuteResult>(
  plugin: ApprovalPlugin<P, R>,
): RegisteredPlugin {
  const parse = (raw: unknown): P => plugin.payload.parse(raw)
  return {
    key: plugin.key,
    permission: plugin.permission,
    permissions: [plugin.permission, ...(plugin.alsoRequires ?? [])],
    subject: (raw) => plugin.subject(parse(raw)),
    describe: (tx, ctx, raw) => plugin.describe(tx, ctx, parse(raw)),
    excluded: (tx, ctx, raw) => plugin.excluded(tx, ctx, parse(raw)),
    execute: (tx, ctx, raw, meta) => plugin.execute(tx, ctx, parse(raw), meta),
    appliesTo: (tx, ctx, subject) =>
      plugin.appliesTo ? plugin.appliesTo(tx, ctx, subject) : Promise.resolve(ORGANIZATION_WIDE),
  }
}

/**
 * What the action's own audit event adds: the approvers in order and the request, or the
 * "No one else could approve this" mark. Nothing when it simply ran.
 */
export function approvalMetadata(meta: ExecuteMeta): Record<string, unknown> {
  if (meta.noApprover) return { noApprover: true }
  if (meta.approvalRequestId === null) return {}
  return { approvedBy: meta.approvedBy, approvalRequestId: meta.approvalRequestId }
}
