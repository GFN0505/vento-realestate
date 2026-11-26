import { ERROR_REFERENCE_PATTERN } from '@vento/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '@/app'
import type { Auth } from '@/auth/auth'
import type { DbOrTx } from '@/db/client'
import { createMemoryTransport } from '@/email/transports/memory'
import { logger } from '@/lib/logger'

/** A database that fails like Drizzle does: the query parameters (personal data) in the message. */
function failingDb(): DbOrTx {
  const failure = new Error(
    'Failed query: select "user_id" from "verifications" where "token" = $1\nparams: aisha@test.vento.ng',
    { cause: Object.assign(new Error('terminating connection'), { code: '57P01' }) },
  )
  return new Proxy(
    {},
    {
      get() {
        throw failure
      },
    },
  ) as DbOrTx
}

function app() {
  return createApp({
    db: failingDb() as Parameters<typeof createApp>[0]['db'],
    auth: {} as Auth,
    mailer: createMemoryTransport(),
  })
}

async function callFailingProcedure(headers: Record<string, string> = {}) {
  return app().request('/rpc/account/passwordResetInfo', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ json: { token: 'a-reset-token' } }),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('unexpected server errors', () => {
  it('answers 500 with a reference that matches the log line', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {})

    const res = await callFailingProcedure()

    expect(res.status).toBe(500)
    const body = (await res.json()) as {
      json: { code: string; message: string; data: { reference: string } }
    }
    expect(body.json.code).toBe('INTERNAL_SERVER_ERROR')
    expect(body.json.message).toBe('Something went wrong on our side')
    expect(body.json.data.reference).toMatch(ERROR_REFERENCE_PATTERN)
    expect(logged).toHaveBeenCalledTimes(1)
    const fields = logged.mock.calls[0]?.[1]
    expect(fields?.reference).toBe(body.json.data.reference)
    expect(fields?.requestId).toBe(res.headers.get('x-request-id'))
  })

  it('keeps personal data and SQL out of the response and the log line', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {})

    const res = await callFailingProcedure()

    const text = await res.text()
    expect(text).not.toMatch(/aisha|select|Failed query/i)
    const line = JSON.stringify(logged.mock.calls[0]?.[1])
    expect(line).not.toContain('aisha@test.vento.ng')
    expect(line).not.toContain('Failed query')
    expect(line).toContain('57P01')
  })

  it('ignores a request id chosen by the client', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {})

    const res = await callFailingProcedure({ 'x-request-id': 'chosen-by-the-client' })

    const id = res.headers.get('x-request-id')
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(logged.mock.calls[0]?.[1]?.requestId).toBe(id)
  })
})

describe('the Postmark bounce webhook route', () => {
  const post = (secret: string | null) =>
    createApp({
      db: failingDb() as Parameters<typeof createApp>[0]['db'],
      auth: {} as Auth,
      mailer: createMemoryTransport(),
      postmarkWebhookSecret: secret,
    }).request('/webhooks/postmark/bounce', { method: 'POST', body: '{}' })

  it('does not exist unless Postmark is the transport', async () => {
    expect((await post(null)).status).toBe(404)
  })

  it('exists and asks for credentials when Postmark is configured', async () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
    expect((await post('x'.repeat(32))).status).toBe(401)
  })
})
