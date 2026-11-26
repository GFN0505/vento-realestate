import { ORPCError } from '@orpc/client'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAccessChanged, isHandledElsewhere, toastApiError } from './api-errors'

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }))

const accessChanged = () =>
  new ORPCError('FORBIDDEN', {
    message: 'Your access has changed. Reload the page to continue.',
    data: { reason: 'access_changed' },
  })

afterEach(() => vi.clearAllMocks())

describe('api errors', () => {
  it('knows the access-changed refusal by its reason, not its words', () => {
    expect(isAccessChanged(accessChanged())).toBe(true)
    const permission = new ORPCError('FORBIDDEN', {
      message: 'Your access has changed. Reload the page to continue.',
      data: { reason: 'permission' },
    })
    expect(isAccessChanged(permission)).toBe(false)
  })

  it('offers Reload, calmly, when access changed mid-action', () => {
    toastApiError(accessChanged())
    expect(toast).toHaveBeenCalledWith(
      'Your access has changed. Reload the page to continue.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Reload' }) }),
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('stays quiet for an expired session and a moved tab', () => {
    const expired = new ORPCError('UNAUTHORIZED', { message: 'Signed out' })
    const moved = new ORPCError('CONFLICT', {
      message: 'moved',
      data: { reason: 'organization_changed' },
    })
    expect(isHandledElsewhere(expired)).toBe(true)
    expect(isHandledElsewhere(moved)).toBe(true)
    toastApiError(expired)
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the server copy for a known refusal', () => {
    toastApiError(
      new ORPCError('CONFLICT', {
        message: 'A role called Site engineer already exists.',
        data: { reason: 'role_name_taken' },
      }),
    )
    expect(toast.error).toHaveBeenCalledWith('A role called Site engineer already exists.')
  })
})
