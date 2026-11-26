import { afterEach, describe, expect, it, vi } from 'vitest'
import { connection, probe, resetConnectionForTests } from './connection'

afterEach(() => {
  resetConnectionForTests(true)
  vi.useRealTimers()
})

describe('connection', () => {
  it('goes offline on the browser event and back online on reconnect', () => {
    const reconnected = vi.fn()
    const stop = connection.onReconnect(reconnected)
    window.dispatchEvent(new Event('offline'))
    expect(connection.isOnline()).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(connection.isOnline()).toBe(true)
    expect(reconnected).toHaveBeenCalledOnce()
    stop()
  })

  it('treats a failed health check as offline, even when the browser says online', async () => {
    vi.useFakeTimers()
    const failing = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await probe(failing)).toBe(false)
    expect(connection.isOnline()).toBe(false)
  })

  it('keeps probing and comes back online when the API answers', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(new Response('ok'))
    await probe(fetchImpl)
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(connection.isOnline()).toBe(true)
  })
})
