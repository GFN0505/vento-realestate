import type { QueryClient } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'
import { resetForNewSession } from './api'

// Kept apart from api.ts so the route guards don't pull the Better Auth client into the entry.
export async function signOut(queryClient: QueryClient) {
  await authClient.signOut()
  resetForNewSession(queryClient)
}
