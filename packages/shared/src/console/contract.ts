import { z } from 'zod'
import { base } from '../common/errors'
import { paginated } from '../common/schemas'
import {
  accountActivity,
  activityPage,
  activityPerson,
  addAi,
  addSuperAdmin,
  changeAiBudget,
  changePlan,
  changeReleaseGroup,
  clearOverride,
  confirmInput,
  consoleStatus,
  dashboard,
  done,
  endedOverride,
  endedOverridesInput,
  endTrial,
  featureWhy,
  inviteSuperAdmin,
  listActivityInput,
  listOrganizationsInput,
  listReleasesInput,
  organizationDetail,
  organizationIdInput,
  organizationRow,
  organizationsSummary,
  passkeyOptionsOutput,
  planDetail,
  planKeyInput,
  planRow,
  publishPlan,
  releaseDetail,
  releaseKeyInput,
  releaseList,
  removeAi,
  removeSuperAdmin,
  resendStaffInvitationInput,
  resetSuperAdminTwoStep,
  setOverride,
  setStage,
  staffInvitationRow,
  staffJoinGetInput,
  staffJoinPreview,
  staffJoinStartInput,
  staffJoinStartOutput,
  startTrial,
  superAdminRow,
  withdrawStaffInvitation,
} from './schema'

/**
 * Every Vento Real Estate console procedure is built from `staff` (decision 0021): no feature flag, and
 * `area: 'console'` so the server's walk can check each one sits on the console chain
 * (session → active super-admin with two-step → open console window), never on `member`.
 */
export const staff = base.meta({ feature: null, area: 'console' })

/** A change is a pair: preview (same lines as the command) then apply (with reason and key). */
function changeProcedures<P extends z.ZodType, O extends z.ZodType, A extends z.ZodType>(c: {
  previewInput: P
  preview: O
  applyInput: A
}) {
  return {
    /** The lines to confirm and the before-state they were computed from. Writes nothing. */
    preview: staff.input(c.previewInput).output(c.preview),
    /**
     * Runs the operation if the state still matches `expected`. Errors: CONFLICT
     * `platform_stale` (moved since the preview, `changedByName`) or `platform_refused` (the
     * operation's own message, maybe `next`). The same key again returns the first answer.
     */
    apply: staff.input(c.applyInput).output(done),
  }
}

export const consoleContract = {
  /**
   * Built on the super-admin check only (no window), so the console can ask "Confirm it's you".
   * Anyone who isn't an active super-admin: NOT_FOUND, with no data.
   */
  access: {
    status: staff.output(consoleStatus),
    /** Opens the window only when the last proof is under 5 minutes old; never prompts. */
    open: staff.output(consoleStatus),
    /** NOT_FOUND when the person has no passkey or passkeys are switched off. */
    passkeyOptions: staff.output(passkeyOptionsOutput),
    /**
     * Code, backup code or passkey; never a password. BAD_REQUEST `wrong_code` (counts towards
     * the sign-in lock) or `passkey_failed` (never counts); TOO_MANY_REQUESTS when locked.
     */
    confirm: staff.input(confirmInput).output(consoleStatus),
  },
  /** The console's home (1b): one read, account-level facts only, internal organizations left out. */
  dashboard: {
    get: staff.output(dashboard),
  },
  organizations: {
    summary: staff.output(organizationsSummary),
    list: staff.input(listOrganizationsInput).output(paginated(organizationRow)),
    get: staff.input(organizationIdInput).output(organizationDetail),
    /** Every catalog feature with why it is or isn't available (bounded by the catalog). */
    features: staff.input(organizationIdInput).output(z.array(featureWhy)),
    endedOverrides: staff.input(endedOverridesInput).output(paginated(endedOverride)),
    /** The Account activity card: people active and this organization's feed for 30 days. */
    accountActivity: staff.input(organizationIdInput).output(accountActivity),
    changePlan: changeProcedures(changePlan),
    startTrial: changeProcedures(startTrial),
    endTrial: changeProcedures(endTrial),
    addAi: changeProcedures(addAi),
    changeAiBudget: changeProcedures(changeAiBudget),
    removeAi: changeProcedures(removeAi),
    changeReleaseGroup: changeProcedures(changeReleaseGroup),
    setOverride: changeProcedures(setOverride),
    clearOverride: changeProcedures(clearOverride),
  },
  releases: {
    /** The whole catalog (about 45 rows), not paginated. */
    list: staff.input(listReleasesInput).output(releaseList),
    get: staff.input(releaseKeyInput).output(releaseDetail),
    setStage: changeProcedures(setStage),
  },
  plans: {
    list: staff.output(z.array(planRow)),
    get: staff.input(planKeyInput).output(planDetail),
    /** Publishing never moves an organization. */
    publish: changeProcedures(publishPlan),
  },
  superAdmins: {
    list: staff.output(z.array(superAdminRow)),
    /** Slice 1's grant; goes when the invite flow is built (1b, B3), never before. */
    add: changeProcedures(addSuperAdmin),
    remove: changeProcedures(removeSuperAdmin),
    /** Open staff invitations (at most 5), plus expired ones from the last 30 days. */
    invitations: staff.output(z.array(staffInvitationRow)),
    invite: changeProcedures(inviteSuperAdmin),
    /** CONFLICT `platform_refused` ("Wait a minute before resending.", not pending); NOT_FOUND. */
    resendInvitation: staff.input(resendStaffInvitationInput).output(done),
    withdrawInvitation: changeProcedures(withdrawStaffInvitation),
    /** Another super-admin's two-step; the router then emails them a password link. */
    resetTwoStep: changeProcedures(resetSuperAdminTwoStep),
  },
  activity: {
    list: staff.input(listActivityInput).output(activityPage),
    people: staff.output(z.array(activityPerson)),
  },
  /**
   * The staff sign-up (1b). Public and rate-limited per IP (the server lists them in
   * `CONSOLE_PUBLIC_PROCEDURES`); still console code, so `area: 'console'` and this subpath.
   */
  join: {
    /** Unknown tokens answer `expired` with nothing else. */
    get: staff.input(staffJoinGetInput).output(staffJoinPreview),
    /**
     * Sets the name and password (or checks it on resume) and signs in; two-step follows through
     * Better Auth. BAD_REQUEST with a password rule's reason, or `wrong_password` on resume
     * (counts towards the sign-in lock; not UNAUTHORIZED, which the web reads as signed out);
     * CONFLICT `invitation_expired`, `invitation_withdrawn`, `invitation_not_pending` or
     * `staff_customer_account`; TOO_MANY_REQUESTS.
     */
    start: staff.input(staffJoinStartInput).output(staffJoinStartOutput),
  },
}
export type ConsoleContract = typeof consoleContract
