import type { ApprovalRequestDetail } from '@vento/shared'

export const REQUEST_ID = '01900000-0000-7000-8000-0000000000a1'

/**
 * Kunle Ojo asked to give Site engineer Approve in Projects; the viewer is the owner or admin
 * who decides step 1 of 1.
 */
export function testRequest(overrides: Partial<ApprovalRequestDetail> = {}): ApprovalRequestDetail {
  return {
    id: REQUEST_ID,
    actionKey: 'access.role.update',
    chip: 'Roles',
    title: 'Site engineer: permissions',
    amount: null,
    makerName: 'Kunle Ojo',
    reason: 'Site engineers now raise POs',
    status: 'pending',
    endedReason: null,
    currentStep: 1,
    stepCount: 1,
    waitingFor: 'Owner or Admin',
    lastDecision: null,
    entity: null,
    createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    decidedAt: null,
    module: 'settings',
    summary: {
      title: 'Site engineer: permissions',
      recordLabel: 'Site engineer',
      recordLink: '/settings/roles/01900000-0000-7000-8000-0000000000b1',
      amount: null,
      changes: [{ field: 'Projects & construction', before: 'View', after: 'View, Approve' }],
    },
    policy: "Change a role's permissions needs approval by Owner or Admin.",
    steps: [{ position: 1, text: 'Owner or Admin', state: 'waiting', decision: null, isYou: true }],
    approveLabel: 'Approve role change',
    irreversible: false,
    isOwn: false,
    canDecide: true,
    blockedReason: null,
    canCancel: false,
    reviewerHint: null,
    endedNote: null,
    expiresAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    ...overrides,
  }
}
