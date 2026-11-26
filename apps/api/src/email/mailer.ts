import type { Env } from '@/env'
import { logger } from '@/lib/logger'
import { parseAllowList, withAllowList } from './allow-list'
import { resolvedAppEnv } from './config'
import { createDevTransport } from './transports/dev'
import { createMemoryTransport, type MemoryMailer } from './transports/memory'
import { createPostmarkTransport } from './transports/postmark'

export type EmailTag =
  | 'verify_email'
  | 'existing_account'
  | 'reset_password'
  | 'invitation'
  | 'security_alert'
  | 'trial_ending'

export type EmailMessage = {
  to: string
  subject: string
  html: string
  text: string
  tag: EmailTag
  /** Display name instead of the default, e.g. "Vento Homes Ltd via Vento" (invitations). */
  fromName?: string
  /** Replies go to a colleague, not a no-reply box (invitations: the inviter). */
  replyTo?: { name: string; email: string }
  /** Ids only, never personal data: the bounce webhook matches on it. */
  metadata?: { invitationId: string }
}

/**
 * What happened to one message. `skipped`: not allowed to send it here (staging allow-list).
 * `failed.kind`: `inactive` (the provider suppressed the address), `rejected` (refused the
 * message), `transient` (network or provider error after a retry), `config` (bad credentials).
 */
export type SendResult =
  | { status: 'sent'; messageId: string }
  | { status: 'skipped' }
  | { status: 'failed'; kind: 'inactive' | 'rejected' | 'transient' | 'config'; code?: number }

/** The only way the app sends email. A provider (Postmark) is one new transport. */
export type Mailer = {
  send(message: EmailMessage): Promise<SendResult>
  /** One result per message, in order. A provider may send them in one call. */
  sendBatch(messages: readonly EmailMessage[]): Promise<SendResult[]>
}

/** For transports without a batch call: one message after another; one failure stays one. */
export async function sendEachInTurn(
  send: (message: EmailMessage) => Promise<SendResult>,
  messages: readonly EmailMessage[],
): Promise<SendResult[]> {
  const results: SendResult[] = []
  for (const message of messages) {
    try {
      results.push(await send(message))
    } catch (error) {
      logger.error('Email transport threw', {
        tag: message.tag,
        error: error instanceof Error ? error.message : String(error),
      })
      results.push({ status: 'failed', kind: 'transient' })
    }
  }
  return results
}

export type MailerConfig = Pick<
  Env,
  | 'APP_ENV'
  | 'EMAIL_TRANSPORT'
  | 'EMAIL_DEV_DIR'
  | 'EMAIL_FROM'
  | 'POSTMARK_SERVER_TOKEN'
  | 'POSTMARK_MESSAGE_STREAM'
  | 'EMAIL_ALLOWED_RECIPIENTS'
>

/**
 * The transport for this environment. `env.ts` has already refused unsafe settings (section 13.3
 * of the Team plan); this only assembles them. Staging and development wrap Postmark in the
 * allow-list: staging skips anyone else, development keeps their email in `.mail/`.
 */
export function createMailer(
  config: MailerConfig,
  options: { pruneDevMailbox?: boolean } = {},
): Mailer | MemoryMailer {
  if (config.EMAIL_TRANSPORT === 'memory') return createMemoryTransport()
  const dev = () => createDevTransport(config.EMAIL_DEV_DIR, { prune: options.pruneDevMailbox })
  if (config.EMAIL_TRANSPORT === 'dev') return dev()
  if (!config.POSTMARK_SERVER_TOKEN) throw new Error('POSTMARK_SERVER_TOKEN is not set')
  const postmark = createPostmarkTransport({
    token: config.POSTMARK_SERVER_TOKEN,
    from: config.EMAIL_FROM,
    stream: config.POSTMARK_MESSAGE_STREAM,
  })
  const appEnv = resolvedAppEnv(config)
  if (appEnv === 'production') return postmark
  const list = parseAllowList(config.EMAIL_ALLOWED_RECIPIENTS)
  return appEnv === 'staging' ? withAllowList(postmark, list) : withAllowList(postmark, list, dev())
}

const thrown: SendResult = { status: 'failed', kind: 'transient' }

/**
 * Sends after the change has committed and never throws: a failed send is logged (tag, kind and
 * code only, never the address) and never undoes the change; the person can ask again. Returns
 * one result per message, in order, for callers that record delivery (invitations).
 */
export async function sendAll(
  mailer: Mailer,
  messages: readonly EmailMessage[],
): Promise<SendResult[]> {
  if (!messages.length) return []
  let results: SendResult[]
  try {
    results = await mailer.sendBatch(messages)
  } catch (error) {
    logger.error('Email send failed', {
      tags: [...new Set(messages.map((m) => m.tag))],
      error: error instanceof Error ? error.message : String(error),
    })
    return messages.map(() => thrown)
  }
  messages.forEach((message, i) => {
    const result = results[i]
    if (result?.status === 'failed') {
      logger.error('Email send failed', {
        tag: message.tag,
        kind: result.kind,
        ...(result.code !== undefined && { code: result.code }),
      })
    }
  })
  return messages.map((_, i) => results[i] ?? thrown)
}
