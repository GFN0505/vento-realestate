import { ORPCError } from '@orpc/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proveAndRetry } from '../api'
import { consoleGate } from './console-gate'

const windowClosed = () =>
  new ORPCError('NOT_FOUND', { data: { reason: 'console_window_closed' }, defined: true })

afterEach(() => consoleGate.reset())

describe('the console gate', () => {
  it('asks on arrival, then mid-task once the window has been open', async () => {
    void consoleGate.prove()
    expect(consoleGate.get()).toEqual({ kind: 'asking', mode: 'entry' })
    consoleGate.opened()
    void consoleGate.prove()
    expect(consoleGate.get()).toEqual({ kind: 'asking', mode: 'expired' })
  })

  it('lets every waiting request go once the person proves it', async () => {
    const first = consoleGate.prove()
    const second = consoleGate.prove()
    consoleGate.opened()
    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
  })

  it('fails waiting requests when the person backs out', async () => {
    consoleGate.opened()
    const waiting = consoleGate.prove()
    consoleGate.dismissed()
    await expect(waiting).resolves.toBe(false)
    expect(consoleGate.isOpen()).toBe(true)
  })
})

describe('a request that finds the window closed', () => {
  it('runs again with the same input after the proof', async () => {
    const next = vi.fn().mockRejectedValueOnce(windowClosed()).mockResolvedValueOnce('done')
    const result = proveAndRetry(next)
    await vi.waitFor(() => expect(consoleGate.get().kind).toBe('asking'))
    consoleGate.opened()
    await expect(result).resolves.toBe('done')
    expect(next).toHaveBeenCalledTimes(2)
  })

  it('fails with its own error when the proof is dismissed', async () => {
    consoleGate.opened()
    const error = windowClosed()
    const result = proveAndRetry(vi.fn().mockRejectedValue(error))
    await vi.waitFor(() => expect(consoleGate.get().kind).toBe('asking'))
    consoleGate.dismissed()
    await expect(result).rejects.toBe(error)
  })

  it('shows the two-step set-up when two-step is off', async () => {
    const error = new ORPCError('NOT_FOUND', {
      data: { reason: 'console_two_step_required' },
      defined: true,
    })
    await expect(proveAndRetry(vi.fn().mockRejectedValue(error))).rejects.toBe(error)
    expect(consoleGate.get()).toEqual({ kind: 'two_step' })
  })

  it('never asks for a plain not found', async () => {
    const error = new ORPCError('NOT_FOUND')
    await expect(proveAndRetry(vi.fn().mockRejectedValue(error))).rejects.toBe(error)
    expect(consoleGate.get()).toEqual({ kind: 'checking' })
  })
})
