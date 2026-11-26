import { afterEach, describe, expect, it, vi } from 'vitest'
import { logger } from '@/lib/logger'
import { isAllowed, parseAllowList, withAllowList } from './allow-list'
import type { EmailMessage } from './mailer'
import { createMemoryTransport } from './transports/memory'

const message = (to: string): EmailMessage => ({
  to,
  subject: 'Join Vento Homes Ltd',
  html: '<p>Join</p>',
  text: 'Join',
  tag: 'invitation',
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the email allow-list', () => {
  const list = parseAllowList(' @ventohomes.ng, test.vento.ng ,Olumide@Gmail.com,')

  it('matches listed domains exactly and listed addresses', () => {
    expect(isAllowed(list, 'aisha@ventohomes.ng')).toBe(true)
    expect(isAllowed(list, 'kunle@test.vento.ng')).toBe(true)
    expect(isAllowed(list, 'olumide@gmail.com')).toBe(true)
    expect(isAllowed(list, 'grace@gmail.com')).toBe(false)
    expect(isAllowed(list, 'aisha@sub.ventohomes.ng')).toBe(false)
    expect(isAllowed(list, 'aisha@notventohomes.ng')).toBe(false)
  })

  it('skips an outside address without passing it on, and logs the tag only', async () => {
    const inner = createMemoryTransport()
    const logged = vi.spyOn(logger, 'info').mockImplementation(() => {})
    const mailer = withAllowList(inner, list)

    const results = await mailer.sendBatch([
      message('grace@gmail.com'),
      message('aisha@ventohomes.ng'),
    ])

    expect(results[0]).toEqual({ status: 'skipped' })
    expect(results[1]).toMatchObject({ status: 'sent' })
    expect(inner.messages.map((m) => m.to)).toEqual(['aisha@ventohomes.ng'])
    expect(logged).toHaveBeenCalledWith('Email skipped (not allowed on staging): invitation', {
      tag: 'invitation',
    })
    expect(JSON.stringify(logged.mock.calls)).not.toContain('grace')
  })

  it('in development, keeps an outside address in the file mailbox instead', async () => {
    const inner = createMemoryTransport()
    const outside = createMemoryTransport()
    const mailer = withAllowList(inner, list, outside)

    const result = await mailer.send(message('demo@example.com'))

    expect(result).toMatchObject({ status: 'sent' })
    expect(inner.messages).toEqual([])
    expect(outside.messages.map((m) => m.to)).toEqual(['demo@example.com'])
  })

  it('skips everyone when the list is empty', async () => {
    vi.spyOn(logger, 'info').mockImplementation(() => {})
    const inner = createMemoryTransport()
    const results = await withAllowList(inner, parseAllowList(undefined)).sendBatch([
      message('aisha@ventohomes.ng'),
    ])
    expect(results).toEqual([{ status: 'skipped' }])
    expect(inner.messages).toEqual([])
  })
})
