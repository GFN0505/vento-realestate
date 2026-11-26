import { and, eq, isNull } from 'drizzle-orm'
import type { DbOrTx } from '@/db/client'
import { runQueries } from '@/db/run-queries'
import {
  members,
  organizationOverrides,
  organizations,
  organizationTrials,
  plans,
  planVersions,
  roles,
  users,
} from '@/db/schema'
import { type EmailMessage, type Mailer, sendAll } from '@/email/mailer'
import { trialEndingEmail } from '@/email/templates/trial-ending'
import { daysUntil } from '../dates'
import { trialLosing } from '../plan-summary'
import {
  type PlatformActor,
  recordOrganizationNotice,
  recordPlatformAudit,
  SCHEDULED_ACTOR,
} from '../platform-audit'
import { loadOrganizationState } from '../snapshot'
import { talkToVentoUrl } from '../talk-to-vento'
import { clearExpiredOverrides, formatIsoDate } from './common'

type OpenTrial = {
  id: string
  organizationId: string
  organizationName: string
  planName: string
  endsOn: string
  expiresAt: Date
  notifiedSevenDaysAt: Date | null
  notifiedOneDayAt: Date | null
}

async function openTrials(db: DbOrTx): Promise<OpenTrial[]> {
  return db
    .select({
      id: organizationTrials.id,
      organizationId: organizationTrials.organizationId,
      organizationName: organizations.name,
      planName: plans.name,
      endsOn: organizationTrials.endsOn,
      expiresAt: organizationTrials.expiresAt,
      notifiedSevenDaysAt: organizationTrials.notifiedSevenDaysAt,
      notifiedOneDayAt: organizationTrials.notifiedOneDayAt,
    })
    .from(organizationTrials)
    .innerJoin(organizations, eq(organizations.id, organizationTrials.organizationId))
    .innerJoin(planVersions, eq(planVersions.id, organizationTrials.planVersionId))
    .innerJoin(plans, eq(plans.id, planVersions.planId))
    .where(and(isNull(organizationTrials.cancelledAt), isNull(organizationTrials.endedRecordedAt)))
}

async function ownerEmails(db: DbOrTx, organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
      ),
    )
  return rows.map((r) => r.email)
}

async function losing(db: DbOrTx, trial: OpenTrial, now: Date): Promise<string[]> {
  const { snapshot, availability } = await loadOrganizationState(db, trial.organizationId, now)
  const overrides = snapshot.organizations.get(trial.organizationId)?.overrides ?? []
  return trialLosing(availability, overrides, trial.id, now)
}

/** Sets a notice stamp only if nobody else did, so two runs never send twice. */
async function claim(
  db: DbOrTx,
  trialId: string,
  stamp: 'notifiedSevenDaysAt' | 'notifiedOneDayAt',
  now: Date,
) {
  const column = organizationTrials[stamp]
  const claimed = await db
    .update(organizationTrials)
    .set(stamp === 'notifiedOneDayAt' ? { notifiedOneDayAt: now } : { notifiedSevenDaysAt: now })
    .where(and(eq(organizationTrials.id, trialId), isNull(column)))
    .returning({ id: organizationTrials.id })
  return claimed.length > 0
}

/**
 * Daily (cron, 08:00 Lagos): emails owners 7 days and 1 day before a trial ends, and records
 * "Your Enterprise trial ended" once it's over. Access already ended on time; this only tells
 * people. Safe to run again: each step is stamped.
 */
export async function notifyTrials(
  db: DbOrTx,
  mailer: Mailer,
  now = new Date(),
  actor: PlatformActor = SCHEDULED_ACTOR,
): Promise<{ emailed: number; ended: number }> {
  let emailed = 0
  let ended = 0
  // Lapsed deals and trials stopped applying at their expiry; record them as cleared so the
  // key is free for the next override.
  await clearExpiredOverrides(db, actor, now)
  for (const trial of await openTrials(db)) {
    if (trial.expiresAt <= now) {
      const recorded = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(organizationTrials)
          .set({ endedRecordedAt: now })
          .where(
            and(eq(organizationTrials.id, trial.id), isNull(organizationTrials.endedRecordedAt)),
          )
          .returning({ id: organizationTrials.id })
        if (!row) return false
        await tx
          .update(organizationOverrides)
          .set({ clearedAt: now, clearedByUserId: actor.userId })
          .where(
            and(
              eq(organizationOverrides.organizationId, trial.organizationId),
              eq(organizationOverrides.trialId, trial.id),
              isNull(organizationOverrides.clearedAt),
            ),
          )
        await recordPlatformAudit(tx, {
          actor,
          action: 'plan.trial_ended',
          targetType: 'organization',
          targetKey: trial.organizationId,
          organizationId: trial.organizationId,
          before: { trial: trial.id, endsOn: trial.endsOn },
          reason: 'Trial reached its end date',
        })
        await recordOrganizationNotice(tx, {
          organizationId: trial.organizationId,
          action: 'plan.trial_ended',
          message: `Your ${trial.planName} trial ended`,
        })
        return true
      })
      if (recorded) ended += 1
      continue
    }
    const days = daysUntil(trial.endsOn, now)
    const stamp =
      days <= 1 && !trial.notifiedOneDayAt
        ? 'notifiedOneDayAt'
        : days <= 7 && days > 1 && !trial.notifiedSevenDaysAt
          ? 'notifiedSevenDaysAt'
          : null
    if (!stamp || !(await claim(db, trial.id, stamp, now))) continue
    const [owners, gone] = await runQueries(db, [
      () => ownerEmails(db, trial.organizationId),
      () => losing(db, trial, now),
    ])
    const email = trialEndingEmail({
      planName: trial.planName,
      endsOn: formatIsoDate(trial.endsOn),
      losing: gone,
      talkUrl: talkToVentoUrl({
        organizationName: trial.organizationName,
        planName: trial.planName,
        about: `${trial.planName} trial`,
      }),
    })
    const messages: EmailMessage[] = owners.map((to) => ({ ...email, to, tag: 'trial_ending' }))
    await sendAll(mailer, messages)
    emailed += messages.length
  }
  return { emailed, ended }
}
