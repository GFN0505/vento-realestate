import { createFileRoute, Outlet } from '@tanstack/react-router'
import { SettingsLayout } from '@/features/settings/settings-layout'

export const Route = createFileRoute('/_app/_shell/settings')({
  // Everyone reaches the layout: My security is personal and needs no settings access (3d).
  // Each organization section carries its own guard and module, so the 403 still comes before
  // any of its loaders.
  component: () => (
    <SettingsLayout>
      <Outlet />
    </SettingsLayout>
  ),
})
