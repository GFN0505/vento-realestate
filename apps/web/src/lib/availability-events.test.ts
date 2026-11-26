import { describe, expect, it, vi } from 'vitest'
import { notifyNotFound, onNotFound } from './availability-events'

describe('availability events', () => {
  it('tells every subscriber, and stops after unsubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const stop = onNotFound(first)
    onNotFound(second)
    notifyNotFound()
    stop()
    notifyNotFound()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(2)
  })
})
