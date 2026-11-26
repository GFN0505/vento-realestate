import { createFileRoute } from '@tanstack/react-router'
import { ComingSoonPage } from '@/features/shell/coming-soon-page'

/** Help centre placeholder: every member can open it. */
export const Route = createFileRoute('/_app/_shell/help')({
  component: () => <ComingSoonPage navKey="help" />,
})
