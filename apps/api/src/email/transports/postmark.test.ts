import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import type { EmailMessage } from '../mailer'
import { createPostmarkTransport } from './postmark'

const invitation: EmailMessage = {
  to: 'aisha@ventohomes.ng',
  subject: 'Join Vento Homes Ltd on Vento',
  html: '<p>Join</p>',
  text: 'Join: https://app.example/invite/token',
  tag: 'invitation',
  fromName: 'Vento "Homes"\r\nLtd via Vento',
  replyTo: { name: 'Olumide Bankole', email: 'olumide@ventohomes.ng' },
  metadata: { invitationId: '01936f1e-8b2a-7c3d-9e4f-000000000001' },
}
const reset: EmailMessage = {
  to: 'kunle@ventohomes.ng',
  subject: 'Reset your password',
  html: '<p>Reset</p>',
  text: 'Reset',
  tag: 'reset_password',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function transport(...replies: (Response | Error)[]) {
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
    const next = replies.shift()
    if (!next || next instanceof Error) throw next ?? new Error('no reply')
    return next
  })
  const mailer = createPostmarkTransport({
    token: 'server-token',
    from: 'Vento Real Estate <no-reply@mail.vento.example>',
    stream: 'outbound',
    fetch: fetch as unknown as typeof globalThis.fetch,
    retryDelayMs: 0,
  })
  const body = (call = 0) => JSON.parse(String(fetch.mock.calls[call]?.[1]?.body))
  return { mailer, fetch, body }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the Postmark transport', () => {
  it('sends one message with the sender details, tracking off and ids-only metadata', async () => {
    const { mailer, fetch, body } = transport(json({ ErrorCode: 0, MessageID: 'pm-1' }))

    expect(await mailer.send(invitation)).toEqual({ status: 'sent', messageId: 'pm-1' })

    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://api.postmarkapp.com/email')
    expect(init?.headers).toMatchObject({
      Accept: 'application/json',
      'X-Postmark-Server-Token': 'server-token',
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(body()).toEqual({
      From: '"Vento Homes Ltd via Vento" <no-reply@mail.vento.example>',
      To: 'aisha@ventohomes.ng',
      Subject: 'Join Vento Homes Ltd on Vento',
      HtmlBody: '<p>Join</p>',
      TextBody: 'Join: https://app.example/invite/token',
      Tag: 'invitation',
      ReplyTo: '"Olumide Bankole" <olumide@ventohomes.ng>',
      Metadata: { invitationId: '01936f1e-8b2a-7c3d-9e4f-000000000001' },
      MessageStream: 'outbound',
      TrackOpens: false,
      TrackLinks: 'None',
    })
  })

  it('uses the default sender name and no Reply-To for account emails', async () => {
    const { mailer, body } = transport(json({ ErrorCode: 0, MessageID: 'pm-2' }))
    await mailer.send(reset)
    expect(body().From).toBe('"Vento Real Estate" <no-reply@mail.vento.example>')
    expect(body()).not.toHaveProperty('ReplyTo')
    expect(body()).not.toHaveProperty('Metadata')
  })

  it('sends a batch in one call and reads each result', async () => {
    const { mailer, fetch } = transport(
      json([
        { ErrorCode: 0, MessageID: 'pm-3' },
        { ErrorCode: 406, Message: 'Inactive recipient' },
      ]),
    )
    vi.spyOn(logger, 'warn').mockImplementation(() => {})

    const results = await mailer.sendBatch([invitation, reset])

    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.postmarkapp.com/email/batch')
    expect(results).toEqual([
      { status: 'sent', messageId: 'pm-3' },
      { status: 'failed', kind: 'inactive', code: 406 },
    ])
  })

  it('maps a refused message and a rejected token', async () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {})
    const refused = transport(json({ ErrorCode: 300, Message: 'Invalid email request' }, 422))
    expect(await refused.mailer.send(reset)).toEqual({
      status: 'failed',
      kind: 'rejected',
      code: 300,
    })

    const badToken = transport(json({ ErrorCode: 10, Message: 'Bad or missing API token' }, 401))
    expect(await badToken.mailer.send(reset)).toEqual({
      status: 'failed',
      kind: 'config',
      code: 10,
    })
    expect(badToken.fetch).toHaveBeenCalledOnce()
  })

  it('retries a network error or 5xx once, then reports transient', async () => {
    const recovered = transport(new Error('ECONNRESET'), json({ ErrorCode: 0, MessageID: 'pm-4' }))
    expect(await recovered.mailer.send(reset)).toEqual({ status: 'sent', messageId: 'pm-4' })
    expect(recovered.fetch).toHaveBeenCalledTimes(2)

    const down = transport(json({}, 503), json({}, 429))
    expect(await down.mailer.sendBatch([reset])).toEqual([
      { status: 'failed', kind: 'transient', code: 429 },
    ])
    expect(down.fetch).toHaveBeenCalledTimes(2)
  })

  it('logs the tag, stream, kind and code, never the address, subject or link', async () => {
    const errors = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const warnings = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const { mailer } = transport(json([{ ErrorCode: 406 }, { ErrorCode: 10 }]))

    await mailer.sendBatch([invitation, reset])

    expect(warnings).toHaveBeenCalledWith('Email not sent: inactive recipient', {
      tag: 'invitation',
      stream: 'outbound',
      kind: 'inactive',
      code: 406,
    })
    expect(errors).toHaveBeenCalledWith('Postmark token rejected', expect.anything())
    const logged = JSON.stringify([...errors.mock.calls, ...warnings.mock.calls])
    for (const secret of ['aisha@', 'kunle@', 'olumide', 'Join', 'https://', 'server-token']) {
      expect(logged).not.toContain(secret)
    }
  })
})
