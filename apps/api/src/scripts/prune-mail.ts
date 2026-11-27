import { MAILBOX_RETENTION, mailboxFolder, pruneMailbox } from '@/email/transports/prune'

/**
 * Trims the development mailbox (`.mail/`) to the last 7 days and the newest 500 emails. Run by
 * Playwright's global setup before specs start reading codes from it. Reads no other settings.
 */
const removed = await pruneMailbox(
  mailboxFolder(process.env.EMAIL_DEV_DIR ?? '.mail'),
  MAILBOX_RETENTION,
)
process.stdout.write(`${JSON.stringify({ removed })}\n`)
