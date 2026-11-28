import { z } from 'zod'

/** Every action written to the audit trail. Text in the database, so new bricks append here. */
export const AUDIT_ACTIONS = [
  'organization.created',
  'organization.updated',
  'entity.created',
  'entity.updated',
  'entity.archived',
  'entity.restored',
  'role.created',
  'role.updated',
  'role.deleted',
  'invitation.sent',
  'invitation.resent',
  'invitation.withdrawn',
  'invitation.accepted',
  'invitation.declined',
  'member.access_changed',
  'member.removed',
  'two_step.enabled',
  'two_step.disabled',
  'two_step.reset',
  'two_step.backup_codes_regenerated',
  'two_step.backup_code_used',
  'account.password_changed',
  'account.password_reset',
  'auth.signed_in',
  'auth.sign_in_failed',
  'auth.two_step_failed',
  'auth.locked_out',
  'session.revoked',
  'session.revoked_others',
  'session.revoked_by_removal',
  'passkey.added',
  'passkey.renamed',
  'passkey.removed',
  /** A passkey signed with a counter that went backwards: it may have been copied. */
  'passkey.suspected_clone',
  'account.name_changed',
  // Written by Vento Real Estate's platform operations (feature flags and plans), actor "Vento Real Estate".
  'plan.assigned',
  'plan.trial_started',
  'plan.trial_ended',
  'plan.trial_cancelled',
  'plan.add_on_added',
  'plan.add_on_removed',
  'plan.feature_overridden',
  'plan.limit_overridden',
  'plan.override_cleared',
  'release.group_changed',
  'release.override_set',
  'release.override_cleared',
  /** Organization trail: "Vento changed your AI budget to ₦250,000 a month". */
  'plan.add_on_changed',
  /** The person's own account trail: they opened the Vento console (with the proof used). */
  'console.opened',
  // Approvals and audit (brick 4). Approval events carry `metadata.module` and `metadata.entityId`.
  'approval.requested',
  'approval.step_approved',
  'approval.approved',
  'approval.rejected',
  'approval.cancelled',
  'approval.expired',
  'approval_rule.created',
  'approval_rule.updated',
  'approval_rule.deleted',
  'audit.exported',
  // Land & title (slice 1). Every event targets the parcel; metadata carries entityId,
  // stageType, documentType, documentId, versionId and versionNo where they apply.
  'land.parcel.created',
  'land.parcel.updated',
  'land.parcel.archived',
  'land.parcel.restored',
  /** `metadata.status`; `metadata.fromAdd` for a stage granted by a document on Add parcel; `metadata.undo`. */
  'land.title_stage.updated',
  /** `metadata.added`, `metadata.removed`: stage types. */
  'land.title_stages.changed',
  'land.document.uploaded',
  /** `metadata.reason`. */
  'land.document.removed',
  /** Undo of a remove. */
  'land.document.restored',
  /** A signed link was issued (decision 0025): `metadata.disposition`, never the link itself. */
  'land.document.link_issued',
  // Land & title (slice 2). Target the parcel too; metadata adds encumbranceId, encumbranceType
  // and blocksSales. The engine's approval.* events for clearing target the encumbrance.
  'land.encumbrance.recorded',
  /** Before and after of the details changed. */
  'land.encumbrance.updated',
  /** `metadata.approvedBy` and `approvalRequestId` (approvalMetadata). */
  'land.encumbrance.cleared',
] as const
export const auditAction = z.enum(AUDIT_ACTIONS)
export type AuditAction = z.infer<typeof auditAction>
