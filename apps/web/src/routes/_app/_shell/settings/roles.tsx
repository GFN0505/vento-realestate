import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_app/_shell/settings/roles')({
  // Organization-wide, the list and every role: the company switcher hides (decision 0014).
  staticData: { orgWide: true },
  component: Outlet,
})
