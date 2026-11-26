import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from '@/lib/logger'
import { type EmailMessage, type Mailer, type SendResult, sendEachInTurn } from '../mailer'
import { MAILBOX_RETENTION, mailboxFolder, pruneMailbox } from './prune'

/** First link or 6-digit code, so a developer can act on the email from the console. */
export function firstActionable(text: string): string | undefined {
  return text.match(/https?:\/\/\S+/)?.[0] ?? text.match(/\b\d{6}\b/)?.[0]
}

/**
 * Development: nothing leaves the machine. Prints a one-line summary and writes the full
 * message as JSON (Playwright reads these to get verification codes).
 */
export function createDevTransport(dir: string, options: { prune?: boolean } = {}): Mailer {
  const folder = mailboxFolder(dir)
  // Only the API at start-up asks for this (not fixtures or commands, which run mid-e2e while
  // specs read codes from the folder), so it never grows without bound.
  if (options.prune) {
    pruneMailbox(folder, MAILBOX_RETENTION).catch((error: unknown) => {
      logger.warn('Dev mailbox not pruned', {
        error: error instanceof Error ? error.message : String(error),
      })
    })
  }
  const send = async (message: EmailMessage): Promise<SendResult> => {
    await mkdir(folder, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, '_')
    const file = join(folder, `${stamp}-${message.tag}-${safeTo}.json`)
    await writeFile(file, JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2))
    process.stdout.write(
      `\n[dev email] to ${message.to}: ${message.subject}\n  ${firstActionable(message.text) ?? ''}\n  saved ${file}\n`,
    )
    return { status: 'sent', messageId: `dev-${randomUUID()}` }
  }
  return { send, sendBatch: (messages) => sendEachInTurn(send, messages) }
}
