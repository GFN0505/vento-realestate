import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '@/features/settings/settings-layout'
import { moduleGuard } from '@/features/shell/module-route'

export const Route = createFileRoute('/_app/_shell/settings')({
  staticData: { module: 'settings' },
  // Before any loader: a role without settings view gets the 403 and requests no team data.
  beforeLoad: moduleGuard('settings'),
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
