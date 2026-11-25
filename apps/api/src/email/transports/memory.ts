import type { EmailMessage, Mailer } from '../mailer'

export type MemoryMailer = Mailer & {
  messages: EmailMessage[]
  /** Messages sent to one address, newest last. */
  to(address: string): EmailMessage[]
  clear(): void
}

/** For Vitest: keeps messages in memory so tests can read links and codes. */
export function createMemoryTransport(): MemoryMailer {
  const messages: EmailMessage[] = []
  return {
    messages,
    async send(message) {
      messages.push(message)
    },
    to(address) {
      return messages.filter((m) => m.to === address.toLowerCase())
    },
    clear() {
      messages.length = 0
    },
  }
}
