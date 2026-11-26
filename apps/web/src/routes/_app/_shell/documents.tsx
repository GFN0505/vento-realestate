import { createFileRoute } from '@tanstack/react-router'
import { ComingSoonPage } from '@/features/shell/coming-soon-page'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/documents')({
  staticData: { module: 'documents' },
  beforeLoad: moduleGuard('documents'),
  component: () => <ComingSoonPage navKey="documents" />,
})
