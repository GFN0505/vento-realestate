import { createFileRoute } from '@tanstack/react-router'
import { ComingSoonPage } from '@/features/shell/coming-soon-page'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/estates')({
  staticData: { module: 'facility' },
  beforeLoad: moduleGuard('estates'),
  component: () => <ComingSoonPage navKey="estates" />,
})
