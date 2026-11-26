import { createFileRoute } from '@tanstack/react-router'
import { ComingSoonPage } from '@/features/shell/coming-soon-page'
import { moduleGuard } from '@/features/shell/module-route'

/** Help centre placeholder. Hidden (404) until the help centre exists; see nav.ts. */
export const Route = createFileRoute('/_app/_shell/help')({
  beforeLoad: moduleGuard('help'),
  component: () => <ComingSoonPage navKey="help" />,
})
