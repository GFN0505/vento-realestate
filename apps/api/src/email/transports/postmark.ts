import { logger } from '@/lib/logger'
import { senderAddress } from '../config'
import { displayName } from '../escape'
import type { EmailMessage, Mailer, SendResult } from '../mailer'

const API = 'https://api.postmarkapp.com'
/** Postmark's limit per batch call. */
const BATCH_LIMIT = 500
const INACTIVE_RECIPIENT = 406
const BAD_TOKEN = 10
/** Postmark is down for maintenance: try again, like a 5xx. */
const MAINTENANCE = 100

export type PostmarkOptions = {
  token: string
  /** `EMAIL_FROM`, e.g. `Vento Real Estate <no-reply@mail.example.com>`. */
  from: string
  stream: string
  fetch?: typeof fetch
  timeoutMs?: number
  retryDelayMs?: number
}

/** Postmark's per-message answer (single send body, or one item of a batch answer). */
type PostmarkReply = { ErrorCode?: number; MessageID?: string; Message?: string }

type Failure = Extract<SendResult, { status: 'failed' }>

/** RFC 5322 quoted display name, sanitized (the invitation code sanitizes too; this is the last line). */
export function quotedName(value: string): string {
  return `"${displayName(value)}"`
}

/** An address can't smuggle extra header parts (`<`, `>`, `,`, quotes or whitespace). */
function bareAddress(value: string): string {
  return value.replace(/[\s<>,;"\\]/g, '')
}

function defaultName(from: string): string {
  const name = from.match(/^\s*"?([^"<]*?)"?\s*</)?.[1]?.trim()
  return name || 'Vento Real Estate'
}

/** The JSON Postmark expects for one message. Tracking is off: links carry one-time tokens. */
export function postmarkBody(
  message: EmailMessage,
  options: Pick<PostmarkOptions, 'from' | 'stream'>,
) {
  const name = quotedName(message.fromName ?? defaultName(options.from))
  return {
    From: `${name} <${bareAddress(senderAddress(options.from))}>`,
    To: bareAddress(message.to),
    Subject: message.subject,
    HtmlBody: message.html,
    TextBody: message.text,
    Tag: message.tag,
    ...(message.replyTo && {
      ReplyTo: `${quotedName(message.replyTo.name)} <${bareAddress(message.replyTo.email)}>`,
    }),
    // Ids only: the bounce webhook matches on it, and Postmark keeps it in its logs.
    ...(message.metadata && { Metadata: { invitationId: message.metadata.invitationId } }),
    MessageStream: options.stream,
    TrackOpens: false,
    TrackLinks: 'None',
  }
}

/** One message's outcome from Postmark's answer. */
export function outcomeOf(reply: PostmarkReply): SendResult {
  const code = reply.ErrorCode ?? 0
  if (code === 0 && reply.MessageID) return { status: 'sent', messageId: reply.MessageID }
  if (code === INACTIVE_RECIPIENT) return { status: 'failed', kind: 'inactive', code }
  if (code === BAD_TOKEN) return { status: 'failed', kind: 'config', code }
  if (code === MAINTENANCE) return { status: 'failed', kind: 'transient', code }
  return { status: 'failed', kind: 'rejected', code }
}

/**
 * A whole call's outcome when Postmark didn't accept it. Its JSON `ErrorCode` decides first
 * (an inactive recipient is HTTP 422 with ErrorCode 406, a bad token 401 with ErrorCode 10); the
 * HTTP status only when there's no usable code (401 → config, 429 or 5xx → transient, retried).
 */
function callFailure(status: number, reply: PostmarkReply | null): Failure {
  const code = reply?.ErrorCode
  if (typeof code === 'number' && code !== 0) {
    const result = outcomeOf({ ErrorCode: code })
    return result.status === 'failed' ? result : { status: 'failed', kind: 'rejected', code }
  }
  if (status === 401) return { status: 'failed', kind: 'config', code: status }
  if (status === 429 || status >= 500) return { status: 'failed', kind: 'transient', code: status }
  return { status: 'failed', kind: 'rejected', code: status }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Postmark over its HTTP API (no SDK: two endpoints). Network errors, timeouts, 429, 5xx and
 * ErrorCode 100 (maintenance) are retried once after a second; everything else is final. Never
 * throws. A timeout can hide a send Postmark did accept, so the retry may deliver twice. Accepted:
 * both copies carry the same code or link, and a missing email is worse than a duplicate.
 */
export function createPostmarkTransport(options: PostmarkOptions): Mailer {
  const doFetch = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000
  const retryDelayMs = options.retryDelayMs ?? 1000

  /** Per-message replies, or one failure for the whole call. */
  async function call(path: string, body: unknown): Promise<PostmarkReply[] | Failure> {
    let last: Failure = { status: 'failed', kind: 'transient' }
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await wait(retryDelayMs)
      let response: Response
      try {
        response = await doFetch(`${API}${path}`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': options.token,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        })
      } catch {
        last = { status: 'failed', kind: 'transient' }
        continue
      }
      const json = await readJson(response)
      if (response.ok && json !== null) {
        return Array.isArray(json) ? (json as PostmarkReply[]) : [json as PostmarkReply]
      }
      last = callFailure(response.status, json as PostmarkReply | null)
      if (last.kind !== 'transient') return last
    }
    return last
  }

  function log(messages: readonly EmailMessage[], results: readonly SendResult[]): void {
    messages.forEach((message, i) => {
      const result = results[i]
      if (result?.status !== 'failed') return
      const fields = {
        tag: message.tag,
        stream: options.stream,
        kind: result.kind,
        code: result.code,
      }
      if (result.kind === 'config') logger.error('Postmark token rejected', fields)
      // A suppressed address: the person's reply in the app is unchanged (no enumeration).
      else if (result.kind === 'inactive') logger.warn('Email not sent: inactive recipient', fields)
    })
  }

  async function sendChunk(messages: readonly EmailMessage[]): Promise<SendResult[]> {
    const body = messages.map((m) => postmarkBody(m, options))
    const replies = await call('/email/batch', body)
    const results: SendResult[] = Array.isArray(replies)
      ? messages.map((_, i) => {
          const reply = replies[i]
          return reply ? outcomeOf(reply) : { status: 'failed', kind: 'transient' }
        })
      : messages.map(() => replies)
    log(messages, results)
    return results
  }

  return {
    async send(message) {
      const replies = await call('/email', postmarkBody(message, options))
      const result: SendResult = Array.isArray(replies) ? outcomeOf(replies[0] ?? {}) : replies
      log([message], [result])
      return result
    },
    async sendBatch(messages) {
      const results: SendResult[] = []
      for (let i = 0; i < messages.length; i += BATCH_LIMIT) {
        results.push(...(await sendChunk(messages.slice(i, i + BATCH_LIMIT))))
      }
      return results
    },
  }
}
