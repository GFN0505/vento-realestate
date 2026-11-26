import { logger } from '@/lib/logger'
import type { EmailMessage, Mailer, SendResult } from './mailer'

export type AllowList = { domains: ReadonlySet<string>; addresses: ReadonlySet<string> }

/**
 * `EMAIL_ALLOWED_RECIPIENTS`: comma-separated. `@example.com` or `example.com` is a domain,
 * matched exactly (not its subdomains); anything with a local part is one address.
 */
export function parseAllowList(raw: string | undefined): AllowList {
  const domains = new Set<string>()
  const addresses = new Set<string>()
  for (const entry of (raw ?? '').split(',')) {
    const value = entry.trim().toLowerCase()
    if (!value) continue
    if (value.startsWith('@')) domains.add(value.slice(1))
    else if (!value.includes('@')) domains.add(value)
    else addresses.add(value)
  }
  return { domains, addresses }
}

export function isAllowed(list: AllowList, address: string): boolean {
  const email = address.trim().toLowerCase()
  const domain = email.slice(email.lastIndexOf('@') + 1)
  return list.addresses.has(email) || list.domains.has(domain)
}

const skipped: SendResult = { status: 'skipped' }

/**
 * Only listed recipients reach `inner` (Postmark). The rest are skipped (staging), or handed to
 * `outside` (development: the `.mail/` folder), so demo and colleagues' addresses never get a
 * real email by accident. Logs carry the tag only, never the address.
 */
export function withAllowList(inner: Mailer, list: AllowList, outside?: Mailer): Mailer {
  // Sends one group through `mailer` and puts each result back at its message's position.
  const into = async (
    results: SendResult[],
    mailer: Mailer,
    group: readonly { message: EmailMessage; index: number }[],
  ): Promise<void> => {
    if (!group.length) return
    const sent = await mailer.sendBatch(group.map((g) => g.message))
    group.forEach((g, n) => {
      results[g.index] = sent[n] ?? { status: 'failed', kind: 'transient' }
    })
  }

  const sendBatch = async (messages: readonly EmailMessage[]): Promise<SendResult[]> => {
    const indexed = messages.map((message, index) => ({ message, index }))
    const allowed = indexed.filter((m) => isAllowed(list, m.message.to))
    const rest = indexed.filter((m) => !isAllowed(list, m.message.to))
    const results: SendResult[] = messages.map(() => skipped)
    await into(results, inner, allowed)
    if (outside) {
      await into(results, outside, rest)
    } else {
      for (const { message } of rest) {
        logger.info(`Email skipped (not allowed on staging): ${message.tag}`, { tag: message.tag })
      }
    }
    return results
  }
  return {
    send: async (message) => (await sendBatch([message]))[0] ?? skipped,
    sendBatch,
  }
}
