import { createFileRoute } from '@tanstack/react-router'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { RolesPage } from '@/features/roles/roles-page'
import { validateNewRoleSearch } from '@/features/settings/role-queries'

export const Route = createFileRoute('/_app/_shell/settings/roles/')({
  validateSearch: validateNewRoleSearch,
  // prefetchQuery never throws: a failure shows "Roles couldn't load" with Try again.
  loader: ({ context: { queryClient } }) => queryClient.prefetchQuery(rolesQuery()),
  component: RolesPage,
})
