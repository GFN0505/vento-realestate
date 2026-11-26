import { randomUUID } from 'node:crypto'
import { type EmailMessage, type Mailer, type SendResult, sendEachInTurn } from '../mailer'

type FailureKind = Extract<SendResult, { status: 'failed' }>['kind']

export type MemoryMailer = Mailer & {
  /** Every message accepted, in order (failed ones aren't kept). */
  messages: EmailMessage[]
  /** Messages sent to one address, newest last. */
  to(address: string): EmailMessage[]
  clear(): void
  /** The next `times` sends fail with this kind, as a provider would report it. */
  failNext(kind: FailureKind, times?: number): void
}

/** For Vitest: keeps messages in memory so tests can read links and codes. */
export function createMemoryTransport(): MemoryMailer {
  const messages: EmailMessage[] = []
  const failures: FailureKind[] = []
  const send = async (message: EmailMessage): Promise<SendResult> => {
    const failure = failures.shift()
    if (failure) return { status: 'failed', kind: failure }
    messages.push(message)
    return { status: 'sent', messageId: `memory-${randomUUID()}` }
  }
  return {
    messages,
    send,
    sendBatch: (batch) => sendEachInTurn(send, batch),
    to(address) {
      return messages.filter((m) => m.to === address.toLowerCase())
    },
    clear() {
      messages.length = 0
    },
    failNext(kind, times = 1) {
      for (let i = 0; i < times; i++) failures.push(kind)
    },
  }
}
