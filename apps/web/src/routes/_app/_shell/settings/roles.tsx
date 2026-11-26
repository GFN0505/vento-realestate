import { createFileRoute, Outlet } from '@tanstack/react-router'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/settings/roles')({
  // Organization-wide, the list and every role: the company switcher hides (decision 0014).
  staticData: { module: 'settings', orgWide: true },
  // Before any loader: a role without settings view gets the 403 and requests nothing.
  beforeLoad: moduleGuard('settings'),
  component: Outlet,
})
