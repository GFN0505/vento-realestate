import { createFileRoute, Outlet } from '@tanstack/react-router'
import { moduleGuard } from '@/features/shell/module-route'

// Land & title's layout: the list (`/land`) and a parcel (`/land/$parcelId`) under one guard.
export const Route = createFileRoute('/_app/_shell/land')({
  staticData: { module: 'land' },
  // Before any loader: a module the organization lacks is a 404, a role without view a 403.
  beforeLoad: moduleGuard('land'),
  component: Outlet,
})
