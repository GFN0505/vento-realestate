import type { QueryClient } from '@tanstack/react-query'
import type { Me } from '@vento/shared'
import { clearPreview } from '@/features/preview/preview-role'
import { clearRecentPages } from '@/features/shell/recent-pages'
import { authClient } from '@/lib/auth-client'
import { orpc } from '@/lib/orpc'
import { removeByPrefix } from '@/lib/storage'
import { forgetTabOrganization } from '@/lib/tab-organization'
import { resetForNewSession } from './api'

// Kept apart from api.ts so the route guards don't pull the Better Auth client into the entry.
export async function signOut(queryClient: QueryClient) {
  const me = queryClient.getQueryData<Me>(orpc.account.me.queryKey())
  await authClient.signOut()
  // Office PCs are shared: page titles and entity choices shouldn't outlive the session.
  if (me) clearRecentPages(me.user.id)
  removeByPrefix('vento-entity:')
  clearPreview()
  forgetTabOrganization()
  resetForNewSession(queryClient)
}
