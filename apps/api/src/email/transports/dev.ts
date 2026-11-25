import { mkdir, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { findRepoRoot } from '@/lib/repo-root'
import type { EmailMessage, Mailer } from '../mailer'

/** First link or 6-digit code, so a developer can act on the email from the console. */
export function firstActionable(text: string): string | undefined {
  return text.match(/https?:\/\/\S+/)?.[0] ?? text.match(/\b\d{6}\b/)?.[0]
}

/**
 * Development: nothing leaves the machine. Prints a one-line summary and writes the full
 * message as JSON (Playwright reads these to get verification codes).
 */
export function createDevTransport(dir: string): Mailer {
  const root = findRepoRoot(import.meta.dirname) ?? process.cwd()
  const folder = isAbsolute(dir) ? dir : join(root, dir)
  return {
    async send(message: EmailMessage) {
      await mkdir(folder, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, '_')
      const file = join(folder, `${stamp}-${message.tag}-${safeTo}.json`)
      await writeFile(
        file,
        JSON.stringify({ ...message, sentAt: new Date().toISOString() }, null, 2),
      )
      process.stdout.write(
        `\n[dev email] to ${message.to}: ${message.subject}\n  ${firstActionable(message.text) ?? ''}\n  saved ${file}\n`,
      )
    },
  }
}
