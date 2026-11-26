import { ORPCError } from '@orpc/client'
import { describe, expect, it, vi } from 'vitest'
import { meQuery } from '@/features/account/api'
import { testMe } from '@/test/me'
import { orpc } from './orpc'
import { createQueryClient } from './query-client'

describe('a request refused because two-step is now required', () => {
  it('refetches me, so the shell opens the setup over the page', async () => {
    const queryClient = createQueryClient()
    queryClient.setQueryData(meQuery().queryKey, testMe('sales'))
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue()
    const refused = new ORPCError('FORBIDDEN', {
      message: 'Set up two-step first.',
      data: { reason: 'two_step_setup_required' },
    })

    await queryClient
      .fetchQuery({ queryKey: ['team'], queryFn: () => Promise.reject(refused), retry: false })
      .catch(() => {})

    expect(invalidate).toHaveBeenCalledWith({ queryKey: orpc.account.me.key() })
  })
})
