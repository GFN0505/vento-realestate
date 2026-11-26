import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useMe } from '@/features/preview/use-effective-permissions'
import { syncTabOrganization, takeOrganizationNotice } from '@/lib/tab-organization'

/**
 * Keeps the open shell honest when `me` changes underneath it (tab focus refetches it):
 * another organization → reload (decision 0013); a new required step (e.g. two-step for a new
 * role) → the guard redirects. Also shows the notice from the last organization change.
 */
export function useShellSync() {
  const me = useMe()
  const router = useRouter()

  useEffect(() => {
    const notice = takeOrganizationNotice()
    if (notice) toast(notice)
  }, [])

  useEffect(() => {
    if (syncTabOrganization(me) === 'reload') return
    if (me.nextStep !== 'ready') void router.invalidate()
  }, [me, router])
}
