import { z } from 'zod'
import { notice } from '../account/schema'
import { platform } from '../common/errors'
import { id } from '../common/schemas'
import {
  approvalRequestDetail,
  approvalRuleInput,
  approvalRuleRow,
  approvalRulesList,
  decideInput,
  decideOutput,
  listApprovalsInput,
  listApprovalsOutput,
  previewApprovalInput,
  previewApprovalOutput,
  updateApprovalRuleInput,
} from './schema'

const byId = z.strictObject({ id })

// Platform procedures: approvals and audit are in every plan (DOMAIN.md, Feature).

export const approvalsContract = {
  /**
   * One tab of the inbox. Every query filters to rows the viewer may see: eligible for the
   * current step (waiting), made by them (mine), or decided by them (decided).
   */
  list: platform.input(listApprovalsInput).output(listApprovalsOutput),
  /** Visible to the maker, the people who decided it and eligible approvers; others NOT_FOUND. */
  get: platform.input(byId).output(approvalRequestDetail),
  /**
   * Approve or reject the current step. Ineligible: FORBIDDEN `own_request` / `not_eligible`.
   * Lost a race: CONFLICT `approval_decided`. Expired or stale: CONFLICT `approval_expired` /
   * `approval_stale`.
   */
  decide: platform.input(decideInput).output(decideOutput),
  /** The maker only, while pending. */
  cancel: platform.input(byId).output(notice),
  /** Whether a guarded action on this record would need approval, and by whom. */
  preview: platform.input(previewApprovalInput).output(previewApprovalOutput),
}

export const approvalRulesContract = {
  /** Settings view: every rule-bearing action with its rules, chains and gaps. */
  list: platform.output(approvalRulesList),
  /** Owners with all-company access. Duplicate scope: CONFLICT `approval_rule_exists`. */
  create: platform.input(approvalRuleInput).output(notice.extend({ rule: approvalRuleRow })),
  /** `version` as loaded; a newer one is CONFLICT `approval_rule_changed`. */
  update: platform.input(updateApprovalRuleInput).output(notice.extend({ rule: approvalRuleRow })),
  /** Pending requests keep their copied steps. The sheet's Undo re-creates the rule. */
  delete: platform.input(byId).output(notice),
}
