import { AUTH_ERROR_CODES } from '@vento/shared'
import { publicRateLimit } from '@/access/middleware'
import type { AuthServerApi } from '@/auth/hooks/deps'
import type { BaseContext } from '@/context'
import { type EmailMessage, sendAll } from '@/email/mailer'
import { errorSummary } from '@/lib/error-summary'
import { badRequest } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { requestScope } from '@/lib/request-scope'
import { consoleWindow, os, superAdmin, superAdminAnyTwoStep } from '@/orpc'
import {
  inviteSuperAdmin,
  previewInvite,
  previewWithdraw,
  resendStaffInvitation,
  withdrawStaffInvitation,
} from '../operations/staff-invitations'
import {
  previewResetTwoStep,
  previewRevoke,
  resetSuperAdminTwoStep,
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
import * as dashboard from './dashboard.service'
import * as join from './join.service'
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

const sa = consoleWindow.console.superAdmins

/**
 * The Vento console. `access.*` sits on the super-admin check only, so the console can ask
 * "Confirm it's you"; everything else is on `consoleWindow` (session → active super-admin with
 * two-step → open window → platform errors as shared errors).
 */
export const consoleRouter = {
  dashboard: {
    get: consoleWindow.console.dashboard.get.handler(({ context }) => dashboard.get(context.db)),
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
    accountActivity: orgs.accountActivity.handler(({ input, context }) =>
      organizations.accountActivity(context.db, input.id),
    ),
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
    list: sa.list.handler(({ context }) => superAdmins.list(context.db, context.user.id)),
    invitations: sa.invitations.handler(({ context }) => superAdmins.invitations(context.db)),
    invite: {
      preview: sa.invite.preview.handler(({ input, context }) => previewInvite(context.db, input)),
      apply: sa.invite.apply.handler(async ({ input, context }) => {
        let emails: EmailMessage[] = []
        const done = await applyOnce(
          context.db,
          context.admin,
          { path: 'superAdmins.invite.apply', input },
          async (actor) => {
            const result = await inviteSuperAdmin(context.db, actor, {
              email: input.email,
              name: input.name,
              reason: input.reason,
              operator: actor.operator,
            })
            // Only once it has committed: a twin request that replays never sends again (R4).
            emails = result.emails
            return result.done
          },
        )
        await sendAll(context.mailer, emails)
        return done
      }),
    },
    resendInvitation: sa.resendInvitation.handler(async ({ input, context }) => {
      let emails: EmailMessage[] = []
      const done = await applyOnce(
        context.db,
        context.admin,
        { path: 'superAdmins.resendInvitation', input },
        async (actor) => {
          const result = await resendStaffInvitation(context.db, actor, input)
          emails = result.emails
          return result.done
        },
      )
      await sendAll(context.mailer, emails)
      return done
    }),
    withdrawInvitation: {
      preview: sa.withdrawInvitation.preview.handler(({ input, context }) =>
        previewWithdraw(context.db, input),
      ),
      apply: sa.withdrawInvitation.apply.handler(({ input, context }) =>
        applyOnce(
          context.db,
          context.admin,
          { path: 'superAdmins.withdrawInvitation.apply', input },
          async (actor) =>
            (
              await withdrawStaffInvitation(context.db, actor, {
                invitationId: input.invitationId,
                reason: input.reason,
              })
            ).done,
        ),
      ),
    },
    resetTwoStep: {
      preview: sa.resetTwoStep.preview.handler(({ input, context }) =>
        previewResetTwoStep(context.db, consoleActor(context.admin), { userId: input.userId }),
      ),
      apply: sa.resetTwoStep.apply.handler(async ({ input, context }) => {
        let reset: Awaited<ReturnType<typeof resetSuperAdminTwoStep>> | null = null
        const done = await applyOnce(
          context.db,
          context.admin,
          { path: 'superAdmins.resetTwoStep.apply', input },
          async (actor) => {
            reset = await resetSuperAdminTwoStep(context.db, actor, {
              userId: input.userId,
              reason: input.reason,
            })
            return reset.done
          },
        )
        // After the commit, and only the first time: a replay sends nothing again.
        const result = reset as Awaited<ReturnType<typeof resetSuperAdminTwoStep>> | null
        if (result) {
          const actor = consoleActor(context.admin)
          await sendAll(
            context.mailer,
            await superAdmins.resetEmails(context.db, actor, result.person, input.reason),
          )
          await requestResetLink(context, result.person.email)
        }
        return done
      }),
    },
    remove: {
      preview: sa.remove.preview.handler(({ input, context }) =>
        previewRevoke(context.db, context.admin, { userId: input.userId }),
      ),
      apply: sa.remove.apply.handler(async ({ input, context }) => {
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
    get: os.console.join.get
      .use(publicRateLimit('staffJoinGet', 20))
      .handler(({ input, context }) => join.get(context.db, input.token)),
    start: os.console.join.start
      .use(publicRateLimit('staffJoinStart', 10))
      .handler(async ({ input, context }) => {
        const { email } = await join.start(context.db, input)
        try {
          // Better Auth makes the session and cookie; the sign-in guard lets a joining account in.
          const { headers } = await context.auth.api.signInEmail({
            body: { email, password: input.password, rememberMe: false },
            headers: context.headers,
            returnHeaders: true,
          })
          for (const cookie of headers.getSetCookie()) {
            context.resHeaders?.append('set-cookie', cookie)
          }
        } catch (error) {
          if (isWrongPassword(error)) {
            throw badRequest('wrong_password', 'That password is wrong. Try again.')
          }
          if (isLocked(error)) throw error
          logger.error('Sign-in after starting a staff sign-up failed', {
            requestId: context.requestId,
            ...errorSummary(error),
          })
          return { next: 'sign_in' as const }
        }
        return { next: 'two_step' as const }
      }),
  },
}

/**
 * The staff sign-up answers without a session (admin-console plan §1b.11). Spread into
 * `PUBLIC_PROCEDURES`; the access walks treat them as public.
 */
export const CONSOLE_PUBLIC_PROCEDURES = ['console.join.get', 'console.join.start'] as const

/** After a console reset: Better Auth's 30-minute, single-use password link. */
async function requestResetLink(
  context: Pick<BaseContext, 'auth' | 'requestId'>,
  email: string,
): Promise<void> {
  // Admin-initiated, so the inbox's hourly cap doesn't apply (audit L7).
  requestScope().auth.adminResetLink = true
  try {
    await context.auth.api.requestPasswordReset({
      body: { email, redirectTo: '/reset-password' },
    })
  } catch (error) {
    // The reset is done; they can still use "Forgot password" to get a link.
    logger.error('Reset link after a super-admin two-step reset not sent', {
      requestId: context.requestId,
      ...errorSummary(error),
    })
  }
}

function authErrorCode(error: unknown): string | null {
  const body = (error as { body?: { code?: unknown } } | null)?.body
  return typeof body?.code === 'string' ? body.code : null
}
const isWrongPassword = (error: unknown) =>
  authErrorCode(error) === AUTH_ERROR_CODES.INVALID_EMAIL_OR_PASSWORD
const isLocked = (error: unknown) => authErrorCode(error) === AUTH_ERROR_CODES.ACCOUNT_LOCKED
