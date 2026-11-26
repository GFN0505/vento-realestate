import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { meQuery } from '@/features/account/api'
import type { NavItem } from '@/features/shell/nav'
import { onNotFound } from '@/lib/availability-events'

/** After any NOT_FOUND, refetch `me`: if a feature was switched off, navigation catches up. */
export function useNotFoundRefetch() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onNotFound(() => {
        // Several failures at once share one refetch.
        void queryClient.invalidateQueries(
          { queryKey: meQuery().queryKey },
          { cancelRefetch: false },
        )
      }),
    [queryClient],
  )
}

/** Spec copy for a feature that disappears while its page is open. */
export function featureLostMessage(label: string): string {
  return `${label} isn't available on your account right now. What you were typing wasn't saved.`
}

/**
 * The page on screen belongs to a module the organization no longer has (switched off, or the
 * plan changed): go Home and say so, once per loss.
 */
export function useFeatureLoss(lost: NavItem | null) {
  const navigate = useNavigate()
  const key = lost?.key
  const label = lost?.label
  useEffect(() => {
    if (!key || !label) return
    // The id keeps it to one toast however many times the effect runs.
    toast(featureLostMessage(label), { id: `feature-lost:${key}` })
    void navigate({ to: '/', replace: true })
  }, [key, label, navigate])
}
