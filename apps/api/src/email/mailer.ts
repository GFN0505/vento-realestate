import type { Env } from '@/env'
import { logger } from '@/lib/logger'
import { createDevTransport } from './transports/dev'
import { createMemoryTransport, type MemoryMailer } from './transports/memory'

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
}

/** The only way the app sends email. A provider (Postmark or Resend) is one new transport. */
export type Mailer = {
  send(message: EmailMessage): Promise<void>
}

export function createMailer(
  config: Pick<Env, 'EMAIL_TRANSPORT' | 'EMAIL_DEV_DIR' | 'NODE_ENV'>,
): Mailer | MemoryMailer {
  // No real provider exists yet: refuse to start rather than silently drop security emails.
  if (config.NODE_ENV === 'production') {
    throw new Error(
      'Production needs a real email provider; dev and memory transports only work locally',
    )
  }
  return config.EMAIL_TRANSPORT === 'memory'
    ? createMemoryTransport()
    : createDevTransport(config.EMAIL_DEV_DIR)
}

/**
 * Sends after the change has committed. A failed send is logged and never undoes the change;
 * the person can ask for the email again.
 */
export async function sendAll(mailer: Mailer, messages: readonly EmailMessage[]): Promise<void> {
  for (const message of messages) {
    try {
      await mailer.send(message)
    } catch (error) {
      logger.error('Email send failed', {
        tag: message.tag,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
