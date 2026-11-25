import { z } from 'zod'

/** Every action written to the audit trail. Text in the database, so new bricks append here. */
export const AUDIT_ACTIONS = [
  'organization.created',
  'organization.updated',
  'entity.created',
  'entity.updated',
  'entity.archived',
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
] as const
export const auditAction = z.enum(AUDIT_ACTIONS)
export type AuditAction = z.infer<typeof auditAction>
