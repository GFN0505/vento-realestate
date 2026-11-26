import { useRouter } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useMe } from '@/features/preview/use-effective-permissions'
import { notify } from '@/lib/notify'
import { syncTabOrganization, takeOrganizationNotice } from '@/lib/tab-organization'

/**
 * Keeps the open shell honest when `me` changes underneath it (tab focus refetches it):
 * another organization → reload (decision 0013); two-step now required (a new role, or the
 * organization's 7 days ran out) → the setup opens over the page, keeping what's on it (3d);
 * any other required step → the guard redirects. Also shows the last organization change notice.
 */
export function useShellSync() {
  const me = useMe()
  const router = useRouter()

  useEffect(() => {
    const notice = takeOrganizationNotice()
    if (notice) notify((toast) => toast(notice))
  }, [])

  useEffect(() => {
    if (syncTabOrganization(me) === 'reload') return
    // Two-step required: TwoStepSetupHost opens the setup over the page from `me` itself.
    if (me.nextStep !== 'ready' && me.nextStep !== 'two_step_setup') void router.invalidate()
  }, [me, router])
}
