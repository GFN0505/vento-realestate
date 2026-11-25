import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { SystemStatus } from '@/components/system-status'
import { orpc } from '@/lib/orpc'

export const Route = createFileRoute('/')({
  // Start fetching during navigation, not after render. Other pages use ensureQueryData so a
  // failure shows the route's error state; here "can't reach the API" is the content itself.
  loader: ({ context }) => context.queryClient.prefetchQuery(orpc.health.check.queryOptions()),
  component: HomePage,
})

function HomePage() {
  const health = useQuery(orpc.health.check.queryOptions())
  if (health.isPending) return <SystemStatus state="loading" />
  if (health.isError) return <SystemStatus state="unreachable" />
  return <SystemStatus state="ready" health={health.data} />
}
