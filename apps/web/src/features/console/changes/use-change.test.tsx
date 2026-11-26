import { ORPCError } from '@orpc/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NETWORK_CHANGE_ERROR } from './change-errors'
import { useChange } from './use-change'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

type Input = { organizationId: string; group: 'pilot' | 'standard' }
type Apply = Input & { expected: { releaseGroup: string }; reason: string; idempotencyKey: string }

const lines = [{ text: 'Moves from standard to pilot', tone: 'info' as const }]
const input: Input = { organizationId: 'org', group: 'pilot' }

function setup() {
  const procedures = {
    preview: vi.fn(async (_: Input) => ({ lines, expected: { releaseGroup: 'standard' } })),
    apply: vi.fn(async (_: Apply) => ({ message: 'Lekki Partners Ltd is now in pilot' })),
  }
  const onDone = vi.fn()
  const queryClient = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const hook = renderHook(() => useChange(procedures, onDone), { wrapper })
  return { procedures, onDone, hook }
}

async function previewAndType(hook: ReturnType<typeof setup>['hook'], reason = 'Release 1 pilot') {
  await act(() => hook.result.current.preview(input))
  act(() => hook.result.current.setReason(reason))
}

afterEach(() => vi.mocked(toast.success).mockReset())

describe('a console change', () => {
  it('needs a reason of 3 characters before it can be confirmed', async () => {
    const { hook } = setup()
    await previewAndType(hook, ' ab ')
    expect(hook.result.current.step).toBe('review')
    expect(hook.result.current.canApply).toBe(false)
    act(() => hook.result.current.setReason('abc'))
    expect(hook.result.current.canApply).toBe(true)
  })

  it('sends the previewed state, the trimmed reason and a key, then says what changed', async () => {
    const { hook, procedures, onDone } = setup()
    await previewAndType(hook, '  Release 1 pilot ')
    await act(() => hook.result.current.apply())
    const sent = procedures.apply.mock.calls[0]?.[0]
    expect(sent).toMatchObject({
      ...input,
      expected: { releaseGroup: 'standard' },
      reason: 'Release 1 pilot',
    })
    expect(sent?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/)
    expect(toast.success).toHaveBeenCalledWith('Lekki Partners Ltd is now in pilot')
    expect(onDone).toHaveBeenCalled()
  })

  it('keeps the reason and the same key when the connection drops, so a retry applies once', async () => {
    const { hook, procedures } = setup()
    procedures.apply.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await previewAndType(hook)
    await act(() => hook.result.current.apply())
    expect(hook.result.current.failure?.message).toBe(NETWORK_CHANGE_ERROR)
    expect(hook.result.current.reason).toBe('Release 1 pilot')
    await act(() => hook.result.current.apply())
    const [first, second] = procedures.apply.mock.calls.map((c) => c[0].idempotencyKey)
    expect(second).toBe(first)
  })

  it('makes a new key after going back to change the fields', async () => {
    const { hook, procedures } = setup()
    procedures.apply.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await previewAndType(hook)
    await act(() => hook.result.current.apply())
    act(() => hook.result.current.back())
    await previewAndType(hook)
    await act(() => hook.result.current.apply())
    const [first, second] = procedures.apply.mock.calls.map((c) => c[0].idempotencyKey)
    expect(second).not.toBe(first)
  })

  it('refreshes the preview when someone else changed it first, and stays open', async () => {
    const { hook, procedures, onDone } = setup()
    const message =
      'Lekki Partners Ltd moved to pilot a moment ago (by Ada). Check the preview and try again.'
    procedures.apply.mockRejectedValueOnce(
      new ORPCError('CONFLICT', {
        message,
        data: { reason: 'platform_stale', changedByName: 'Ada' },
      }),
    )
    await previewAndType(hook)
    await act(() => hook.result.current.apply())
    expect(procedures.preview).toHaveBeenCalledTimes(2)
    expect(hook.result.current.failure?.message).toBe(message)
    expect(hook.result.current.step).toBe('review')
    expect(onDone).not.toHaveBeenCalled()
  })

  it("shows the operation's own refusal with its next step", async () => {
    const { hook, procedures } = setup()
    const message = 'Lekki Partners Ltd already has a trial ending 2 Jan 2027.'
    procedures.apply.mockRejectedValueOnce(
      new ORPCError('CONFLICT', {
        message,
        data: { reason: 'platform_refused', next: 'end_trial' },
      }),
    )
    await previewAndType(hook)
    await act(() => hook.result.current.apply())
    expect(hook.result.current.failure).toMatchObject({ message, next: 'end_trial' })
  })
})
