import type { AuthServerApi } from '@/auth/hooks/deps'
import { sendAll } from '@/email/mailer'
import { notFound } from '@/lib/errors'
import { consoleWindow, superAdmin, superAdminAnyTwoStep } from '@/orpc'
import {
  grantSuperAdmin,
  previewGrant,
  previewRevoke,
  revokeSuperAdmin,
} from '../operations/super-admin'
import * as access from './access.service'
import * as activity from './activity.service'
import { consoleActor } from './actor'
import { applyOnce } from './apply-once'
import {
  addAiChange,
  changeAiBudgetChange,
  changePlanChange,
  clearOverrideChange,
  endTrialChange,
  publishChange,
  releaseGroupChange,
  removeAiChange,
  setOverrideChange,
  setStageChange,
  startTrialChange,
} from './changes'
import * as organizations from './organizations.service'
import * as plans from './plans.service'
import * as releases from './releases.service'
import * as superAdmins from './super-admins.service'

type AccessRequest = Omit<access.AccessContext, 'authApi'> & { auth: { api: unknown } }

function accessContext(context: AccessRequest): access.AccessContext {
  const auth = context.auth as { api: unknown; $context?: Promise<{ secretConfig?: unknown }> }
  return {
    ...context,
    authApi: auth.api as AuthServerApi,
    // Better Auth's own key, read only when a code needs checking (absent in stubbed tests).
    totpKey: async () => (await auth.$context)?.secretConfig as access.TotpKey | undefined,
  }
}

/**
 * A preview/apply pair over one change: apply runs at most once per idempotency key, as the
 * signed-in super-admin (decision 0021). Organizations are named by id in the input, never taken
 * from the session.
 */
const orgs = consoleWindow.console.organizations

/**
 * Slice 1b procedures whose contract is in but whose code isn't yet (admin-console plan §1b.18,
 * steps B3 and B4). They answer like a procedure that doesn't exist, behind the full console
 * chain, so nothing is reachable early. `join.*` move to public procedures with their code (B3).
 */
const notBuiltYet = (): never => {
  throw notFound()
}
const sa = consoleWindow.console.superAdmins

/**
 * The Vento console. `access.*` sits on the super-admin check only, so the console can ask
 * "Confirm it's you"; everything else is on `consoleWindow` (session → active super-admin with
 * two-step → open window → platform errors as shared errors).
 */
export const consoleRouter = {
  dashboard: {
    get: consoleWindow.console.dashboard.get.handler(notBuiltYet),
  },
  access: {
    status: superAdminAnyTwoStep.console.access.status.handler(({ context }) =>
      access.status(accessContext(context)),
    ),
    open: superAdmin.console.access.open.handler(({ context }) =>
      access.open(accessContext(context)),
    ),
    passkeyOptions: superAdmin.console.access.passkeyOptions.handler(({ context }) =>
      access.passkeyOptions(accessContext(context)),
    ),
    confirm: superAdmin.console.access.confirm.handler(({ input, context }) =>
      access.confirm(accessContext(context), input),
    ),
  },
  organizations: {
    summary: orgs.summary.handler(({ context }) => organizations.summary(context.db)),
    list: orgs.list.handler(({ input, context }) => organizations.list(context.db, input)),
    get: orgs.get.handler(({ input, context }) => organizations.get(context.db, input.id)),
    features: orgs.features.handler(({ input, context }) =>
      organizations.features(context.db, input.id),
    ),
    endedOverrides: orgs.endedOverrides.handler(({ input, context }) =>
      organizations.endedOverrides(context.db, input),
    ),
    accountActivity: orgs.accountActivity.handler(notBuiltYet),
    changePlan: {
      preview: orgs.changePlan.preview.handler(({ input, context }) =>
        changePlanChange.preview(context.db, input),
      ),
      apply: orgs.changePlan.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.changePlan.apply', input },
          (actor) => changePlanChange.apply(context.db, actor, input),
        ),
      ),
    },
    startTrial: {
      preview: orgs.startTrial.preview.handler(({ input, context }) =>
        startTrialChange.preview(context.db, input),
      ),
      apply: orgs.startTrial.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.startTrial.apply', input },
          (actor) => startTrialChange.apply(context.db, actor, input),
        ),
      ),
    },
    endTrial: {
      preview: orgs.endTrial.preview.handler(({ input, context }) =>
        endTrialChange.preview(context.db, input),
      ),
      apply: orgs.endTrial.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.endTrial.apply', input },
          (actor) => endTrialChange.apply(context.db, actor, input),
        ),
      ),
    },
    addAi: {
      preview: orgs.addAi.preview.handler(({ input, context }) =>
        addAiChange.preview(context.db, input),
      ),
      apply: orgs.addAi.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.addAi.apply', input },
          (actor) => addAiChange.apply(context.db, actor, input),
        ),
      ),
    },
    changeAiBudget: {
      preview: orgs.changeAiBudget.preview.handler(({ input, context }) =>
        changeAiBudgetChange.preview(context.db, input),
      ),
      apply: orgs.changeAiBudget.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.changeAiBudget.apply', input },
          (actor) => changeAiBudgetChange.apply(context.db, actor, input),
        ),
      ),
    },
    removeAi: {
      preview: orgs.removeAi.preview.handler(({ input, context }) =>
        removeAiChange.preview(context.db, input),
      ),
      apply: orgs.removeAi.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.removeAi.apply', input },
          (actor) => removeAiChange.apply(context.db, actor, input),
        ),
      ),
    },
    changeReleaseGroup: {
      preview: orgs.changeReleaseGroup.preview.handler(({ input, context }) =>
        releaseGroupChange.preview(context.db, input),
      ),
      apply: orgs.changeReleaseGroup.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.changeReleaseGroup.apply', input },
          (actor) => releaseGroupChange.apply(context.db, actor, input),
        ),
      ),
    },
    setOverride: {
      preview: orgs.setOverride.preview.handler(({ input, context }) =>
        setOverrideChange.preview(context.db, input),
      ),
      apply: orgs.setOverride.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.setOverride.apply', input },
          (actor) => setOverrideChange.apply(context.db, actor, input),
        ),
      ),
    },
    clearOverride: {
      preview: orgs.clearOverride.preview.handler(({ input, context }) =>
        clearOverrideChange.preview(context.db, input),
      ),
      apply: orgs.clearOverride.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'organizations.clearOverride.apply', input },
          (actor) => clearOverrideChange.apply(context.db, actor, input),
        ),
      ),
    },
  },
  releases: {
    list: consoleWindow.console.releases.list.handler(({ input, context }) =>
      releases.list(context.db, input),
    ),
    get: consoleWindow.console.releases.get.handler(({ input, context }) =>
      releases.get(context.db, input.key),
    ),
    setStage: {
      preview: consoleWindow.console.releases.setStage.preview.handler(({ input, context }) =>
        setStageChange.preview(context.db, input),
      ),
      apply: consoleWindow.console.releases.setStage.apply.handler(({ input, context }) =>
        applyOnce(context.db, context.admin, { path: 'releases.setStage.apply', input }, (actor) =>
          setStageChange.apply(context.db, actor, input),
        ),
      ),
    },
  },
  plans: {
    list: consoleWindow.console.plans.list.handler(({ context }) => plans.list(context.db)),
    get: consoleWindow.console.plans.get.handler(({ input, context }) =>
      plans.get(context.db, input.key),
    ),
    publish: {
      preview: consoleWindow.console.plans.publish.preview.handler(({ input, context }) =>
        publishChange.preview(context.db, input),
      ),
      apply: consoleWindow.console.plans.publish.apply.handler(({ input, context }) =>
        applyOnce(context.db, context.admin, { path: 'plans.publish.apply', input }, (actor) =>
          publishChange.apply(context.db, actor, input),
        ),
      ),
    },
  },
  superAdmins: {
    list: consoleWindow.console.superAdmins.list.handler(({ context }) =>
      superAdmins.list(context.db, context.user.id),
    ),
    invitations: sa.invitations.handler(notBuiltYet),
    invite: {
      preview: sa.invite.preview.handler(notBuiltYet),
      apply: sa.invite.apply.handler(notBuiltYet),
    },
    resendInvitation: sa.resendInvitation.handler(notBuiltYet),
    withdrawInvitation: {
      preview: sa.withdrawInvitation.preview.handler(notBuiltYet),
      apply: sa.withdrawInvitation.apply.handler(notBuiltYet),
    },
    resetTwoStep: {
      preview: sa.resetTwoStep.preview.handler(notBuiltYet),
      apply: sa.resetTwoStep.apply.handler(notBuiltYet),
    },
    add: {
      preview: consoleWindow.console.superAdmins.add.preview.handler(({ input, context }) =>
        previewGrant(context.db, { email: input.email }),
      ),
      apply: consoleWindow.console.superAdmins.add.apply.handler(async ({ input, context }) => {
        let ran = false
        const done = await applyOnce(
          context.db,
          context.admin,
          { path: 'superAdmins.add.apply', input },
          async (actor) => {
            const message = await grantSuperAdmin(context.db, actor, {
              email: input.email,
              reason: input.reason,
              operator: actor.operator,
            })
            // Only once it has committed: a twin request that replays never sends again (R4).
            ran = true
            return message
          },
        )
        // After the commit, and only the first time: a replay sends nothing again.
        if (ran) {
          const actor = consoleActor(context.admin)
          await sendAll(
            context.mailer,
            await superAdmins.addedEmails(context.db, actor, input, input.reason),
          )
        }
        return done
      }),
    },
    remove: {
      preview: consoleWindow.console.superAdmins.remove.preview.handler(({ input, context }) =>
        previewRevoke(context.db, context.admin, { userId: input.userId }),
      ),
      apply: consoleWindow.console.superAdmins.remove.apply.handler(async ({ input, context }) => {
        let ran = false
        const done = await applyOnce(
          context.db,
          context.admin,
          { path: 'superAdmins.remove.apply', input },
          async (actor) => {
            const message = await revokeSuperAdmin(context.db, actor, {
              userId: input.userId,
              reason: input.reason,
            })
            ran = true
            return message
          },
        )
        if (ran) {
          const actor = consoleActor(context.admin)
          await sendAll(
            context.mailer,
            await superAdmins.removedEmails(context.db, actor, input, input.reason),
          )
        }
        return done
      }),
    },
  },
  activity: {
    list: consoleWindow.console.activity.list.handler(({ input, context }) =>
      activity.list(context.db, input),
    ),
    people: consoleWindow.console.activity.people.handler(({ context }) =>
      activity.people(context.db),
    ),
  },
  join: {
    get: consoleWindow.console.join.get.handler(notBuiltYet),
    start: consoleWindow.console.join.start.handler(notBuiltYet),
  },
}
