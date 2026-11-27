import type { DbOrTx } from '@/db/client'
import { type EmailMessage, type Mailer, sendAll } from '@/email/mailer'
import { errorSummary } from '@/lib/error-summary'
import { logger } from '@/lib/logger'
import type { AfterCommitDeps } from './plugin'

/**
 * Emails and any other follow-up of an approval, after the transaction committed. Never throws:
 * a mail failure never undoes a decision (plan R7).
 */
export async function runAfterCommit(
  context: { db: DbOrTx; mailer: Mailer; requestId?: string },
  organizationId: string,
  result: {
    emails: readonly EmailMessage[]
    afterCommit: ((deps: AfterCommitDeps) => Promise<void>) | null
  },
): Promise<void> {
  await sendAll(context.mailer, result.emails)
  if (!result.afterCommit) return
  try {
    await result.afterCommit({
      db: context.db,
      mailer: context.mailer,
      organizationId,
      requestId: context.requestId,
    })
  } catch (error) {
    logger.error('Approval follow-up failed', {
      requestId: context.requestId,
      ...errorSummary(error),
    })
  }
}
