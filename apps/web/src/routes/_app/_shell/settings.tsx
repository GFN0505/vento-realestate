import { createFileRoute } from '@tanstack/react-router'
import { ComingSoonPage } from '@/features/shell/coming-soon-page'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/settings')({
  staticData: { module: 'settings' },
  beforeLoad: moduleGuard('settings'),
  component: () => <ComingSoonPage navKey="settings" />,
})
